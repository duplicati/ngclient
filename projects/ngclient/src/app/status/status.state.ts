import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { ActiveFile, ActiveTransfer, DuplicatiServer, IProgressEventData } from '../core/openapi';
import { ServerStateService } from '../core/services/server-state.service';
import { SysinfoState } from '../core/states/sysinfo.state';
import { SystemStatusQueueItem, SystemStatusSnapshot } from '../core/types/system-status';

export interface RecentFile {
  filename: string;
  filesize: number;
  timestamp: Date;
}

export interface ETAData {
  startTime: Date;
  filesProcessedAtStart: number;
  bytesProcessedAtStart: number;
  currentFilesPerSecond: number;
  currentBytesPerSecond: number;
  estimatedCompletion: Date | null;
  metric: 'files' | 'bytes';
}

/** One point in the client-side history; values that are not reported are null */
export interface TelemetrySample {
  time: number;
  uploadSpeed: number | null;
  downloadSpeed: number | null;
  readSpeed: number | null;
  machineCpu: number | null;
  /** The server process */
  serverCpu: number | null;
  serverMemory: number | null;
  managedHeap: number | null;
  /** The runner processes, when operations run out of process; null when none is running */
  runnerCpu: number | null;
  runnerMemory: number | null;
}

export interface TransferTotals {
  taskId: number | null;
  uploaded: number;
  downloaded: number;
}

export type HistoryWindow = '1m' | '5m' | '15m';

/**
 * Where snapshots come from: pushed over the websocket, polled from the REST endpoint,
 * or, on servers without system status, built from the progress data
 */
export type SystemStatusSource = 'websocket' | 'polling' | 'legacy';

const HISTORY_WINDOW_MS: Record<HistoryWindow, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000 };

/** How long the history is kept; the largest window that can be shown */
export const HISTORY_RETENTION_MS = HISTORY_WINDOW_MS['15m'];
/**
 * The sample interval for servers that do not say which to use. The interval is set on the server,
 * which sends it with each system status snapshot, so it can be changed in one place.
 */
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const MAX_RECENT_FILES = 20;

const UPLOAD_ACTIONS = new Set(['Put']);
const DOWNLOAD_ACTIONS = new Set(['Get']);

@Injectable({
  providedIn: 'root',
})
export class StatusPageState {
  #statusBarState = inject(StatusBarState);
  #serverState = inject(ServerStateService);
  #sysinfo = inject(SysinfoState);
  #dupServer = inject(DuplicatiServer);

  #recentFiles = signal<RecentFile[]>([]);
  recentFiles = this.#recentFiles.asReadonly();

  #etaData = signal<ETAData | null>(null);
  etaData = this.#etaData.asReadonly();

  #history = signal<TelemetrySample[]>([]);
  history = this.#history.asReadonly();

  #transferTotals = signal<TransferTotals>({ taskId: null, uploaded: 0, downloaded: 0 });
  transferTotals = this.#transferTotals.asReadonly();

  historyWindow = signal<HistoryWindow>('5m');
  historyWindowMs = computed(() => HISTORY_WINDOW_MS[this.historyWindow()]);

  #viewActivatedAt: Date | null = null;
  #initialProgress: { files: number; bytes: number } | null = null;
  #etaTaskId: number | null = null;
  #etaInterval: ReturnType<typeof setInterval> | null = null;
  #fallbackInterval: ReturnType<typeof setInterval> | null = null;
  #pollTimer: ReturnType<typeof setTimeout> | null = null;
  #isPolling = false;
  #polledSnapshot = signal<SystemStatusSnapshot | null>(null);
  #isActive = signal(false);

  // Last values seen, used to turn cumulative counters into rates
  #lastTransferProgress = new Map<string, number>();
  #lastProcessed: { time: number; bytes: number; taskId: number | null } | null = null;
  #lastSnapshotTimestamp: string | null = null;
  #needsBaseline = true;
  #lastServerTotals: { taskId: number | null; uploaded: number; downloaded: number } | null = null;

  source = computed<SystemStatusSource>(() => {
    if (!this.#sysinfo.hasSystemStatus()) return 'legacy';
    return this.#serverState.getConnectionMethod() === 'websocket' ? 'websocket' : 'polling';
  });

  /** True when the server reports system status, so CPU, memory and queue details are available */
  hasSystemStatus = computed(() => this.source() !== 'legacy');

  snapshot = computed(() => {
    const source = this.source();
    if (source === 'websocket') return this.#serverState.systemStatusState();
    if (source === 'polling') return this.#polledSnapshot();
    return null;
  });

  /** The interval between samples, as set on the server */
  sampleIntervalMs = computed(() => this.snapshot()?.IntervalMs || DEFAULT_SAMPLE_INTERVAL_MS);

  /** The progress of the running task, from the snapshot if available */
  progress = computed<IProgressEventData | null>(() => {
    const snapshot = this.snapshot();
    if (snapshot) return snapshot.Progress;

    // The status bar keeps the last progress after a task ends, so it is only used
    // for the task the server reports as active
    const activeTaskId = this.#statusBarState.serverState()?.ActiveTask?.Item1 ?? null;
    const data = this.#statusBarState.statusData();
    return activeTaskId !== null && data?.TaskID === activeTaskId ? data : null;
  });

  queue = computed<SystemStatusQueueItem[]>(() => {
    const snapshot = this.snapshot();
    if (snapshot) return snapshot.Queue;

    return (this.#serverState.taskQueueState() ?? []).map((x) => ({
      TaskID: x.ID ?? 0,
      BackupID: null,
      BackupName: null,
      Operation: '',
      Status: x.Status ?? 'Waiting',
      TaskStarted: x.TaskStarted ?? null,
    }));
  });

  machine = computed(() => this.snapshot()?.Machine ?? null);
  processes = computed(() => this.snapshot()?.Processes ?? []);
  serverProcess = computed(() => this.processes().find((x) => x.Role === 'server') ?? null);
  controllerProcesses = computed(() => this.processes().filter((x) => x.Role !== 'server'));
  threadCount = computed(() => this.processes().reduce((a, b) => a + b.ThreadCount, 0));

  /** True when operations run in a separate runner process now, or did within the shown window */
  hasRunner = computed(
    () =>
      this.controllerProcesses().length > 0 ||
      this.visibleHistory().some((x) => x.runnerCpu != null || x.runnerMemory != null)
  );

  activeTransfers = computed<ActiveTransfer[]>(() => this.progress()?.ActiveTransfers ?? []);

  /**
   * The files being processed. Servers that process files in parallel list them all;
   * otherwise this is the single current file
   */
  activeFiles = computed<ActiveFile[]>(() => {
    const p = this.progress();
    if (p?.ActiveFiles?.length) return p.ActiveFiles;
    if (!p?.CurrentFilename) return [];
    return [{ Path: p.CurrentFilename, Size: p.CurrentFilesize ?? 0, Offset: p.CurrentFileoffset ?? 0 }];
  });

  /** The samples inside the selected window */
  visibleHistory = computed(() => {
    const samples = this.#history();
    if (samples.length === 0) return samples;
    const from = samples[samples.length - 1].time - this.historyWindowMs();
    return samples.filter((x) => x.time >= from);
  });

  latestSample = computed(() => {
    const samples = this.#history();
    return samples.length > 0 ? samples[samples.length - 1] : null;
  });

  /** The files in the last reported list, to find the ones that have been processed */
  #lastActiveFiles = new Map<string, number>();

  recentFileEffect = effect(() => {
    const progress = this.progress();
    if (!progress) return;

    // With a list of files, a file is processed when it leaves the list
    const list = progress.ActiveFiles;
    if (list && (list.length > 0 || this.#lastActiveFiles.size > 0)) {
      const current = new Map(list.filter((f) => f.Path).map((f) => [f.Path!, f.Size ?? 0]));
      for (const [path, size] of this.#lastActiveFiles) if (!current.has(path)) this.#addRecentFile(path, size);
      this.#lastActiveFiles = current;
      return;
    }

    if (progress.CurrentFilename && progress.CurrentFilesize !== undefined) {
      this.#addRecentFile(progress.CurrentFilename, progress.CurrentFilesize);
    }
  });

  #snapshotEffect = effect(() => {
    const snapshot = this.snapshot();
    if (!this.#isActive() || !snapshot || snapshot.Timestamp === this.#lastSnapshotTimestamp) return;

    this.#lastSnapshotTimestamp = snapshot.Timestamp;
    this.#addSample(snapshot.Progress, snapshot);
  });

  #subscriptionEffect = effect(() => {
    if (!this.#isActive()) return;

    const source = this.source();
    if (source !== 'legacy') this.#stopFallbackSampling();
    if (source !== 'polling') this.#stopPolling();

    if (source === 'websocket') this.#serverState.subscribe('systemstatus');
    else if (source === 'polling') this.#startPolling();
    else this.#startFallbackSampling();
  });

  #addRecentFile(filename: string, filesize: number) {
    const now = new Date();

    this.#recentFiles.update((files) => {
      if (files.length > 0 && files[0].filename === filename) {
        return files;
      }

      const newFiles = [{ filename, filesize, timestamp: now }, ...files];

      return newFiles.slice(0, MAX_RECENT_FILES);
    });
  }

  activateView() {
    this.#viewActivatedAt = new Date();

    const statusData = this.#statusBarState.statusData();

    if (statusData && statusData.ProcessedFileCount !== undefined && statusData.ProcessedFileSize !== undefined) {
      this.#initialProgress = {
        files: statusData.ProcessedFileCount,
        bytes: statusData.ProcessedFileSize,
      };
      this.#etaTaskId = statusData.TaskID ?? null;
    }

    this.#etaInterval = setInterval(() => {
      this.#calculateETA();
    }, 1000);

    // Rates are computed between samples, so do not compare with values from before the view was left
    this.#needsBaseline = true;
    this.#isActive.set(true);
  }

  deactivateView() {
    this.#viewActivatedAt = null;
    this.#initialProgress = null;
    if (this.#etaInterval) {
      clearInterval(this.#etaInterval);
      this.#etaInterval = null;
    }

    this.#isActive.set(false);
    this.#stopFallbackSampling();
    this.#stopPolling();
    if (this.source() === 'websocket') this.#serverState.unsubscribe('systemstatus');
  }

  #startPolling() {
    if (this.#isPolling) return;
    this.#isPolling = true;
    this.#poll();
  }

  #stopPolling() {
    this.#isPolling = false;
    if (this.#pollTimer) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  #poll() {
    this.#pollTimer = null;

    // The next request is scheduled when this one is done, so a slow connection does not queue
    // requests, and the interval follows the one the server sends with each snapshot
    defer(() => this.#dupServer.getApiV2SystemStatus())
      .pipe(
        finalize(() => {
          if (this.#isPolling) this.#pollTimer = setTimeout(() => this.#poll(), this.sampleIntervalMs());
        })
      )
      .subscribe({
        next: (res) => {
          if (this.#isActive() && res.Success && res.Data) this.#polledSnapshot.set(res.Data as SystemStatusSnapshot);
        },
        error: () => {
          // Keep the last snapshot; the next tick retries
        },
      });
  }

  #startFallbackSampling() {
    if (this.#fallbackInterval) return;
    this.#fallbackInterval = setInterval(() => {
      this.#addSample(this.#statusBarState.statusData() ?? null, null);
    }, DEFAULT_SAMPLE_INTERVAL_MS);
  }

  #stopFallbackSampling() {
    if (this.#fallbackInterval) {
      clearInterval(this.#fallbackInterval);
      this.#fallbackInterval = null;
    }
  }

  #addSample(progress: IProgressEventData | null, snapshot: SystemStatusSnapshot | null) {
    const now = Date.now();
    const taskId = progress?.TaskID ?? null;
    const isBaseline = this.#needsBaseline;
    this.#needsBaseline = false;
    if (isBaseline) this.#lastProcessed = null;

    const previousTime = this.latestSample()?.time ?? null;
    const elapsedSeconds = previousTime !== null ? Math.max((now - previousTime) / 1000, 0.001) : null;

    // Servers that count completed transfers include those that finish between two snapshots,
    // which the active transfers never show; older servers only have the active transfers
    const serverTotals =
      progress?.BackendBytesUploaded != null
        ? { uploaded: progress.BackendBytesUploaded, downloaded: progress.BackendBytesDownloaded ?? 0 }
        : null;
    const { uploaded, downloaded } = serverTotals
      ? this.#transfersFromTotals(taskId, serverTotals, isBaseline)
      : this.#accumulateTransfers(taskId, progress?.ActiveTransfers ?? [], isBaseline);

    // Rates from the transferred deltas are more stable than the per-transfer speed, which resets per file.
    // The first sample after the view is opened only records the baseline.
    const uploadSpeed = isBaseline || !elapsedSeconds ? null : Math.round(uploaded / elapsedSeconds);
    const downloadSpeed = isBaseline || !elapsedSeconds ? null : Math.round(downloaded / elapsedSeconds);

    let readSpeed: number | null = null;
    // Servers that report the bytes read leave out unchanged files, which the processed size counts
    // without reading them; older servers only have the processed size
    const processedBytes =
      progress && 'SourceBytesRead' in progress
        ? (progress.SourceBytesRead ?? null)
        : (progress?.ProcessedFileSize ?? null);
    if (processedBytes !== null && processedBytes >= 0) {
      const last = this.#lastProcessed;
      if (last && last.taskId === taskId && now > last.time) {
        readSpeed = Math.round(Math.max(0, processedBytes - last.bytes) / ((now - last.time) / 1000));
      }
      this.#lastProcessed = { time: now, bytes: processedBytes, taskId };
    } else {
      this.#lastProcessed = null;
    }

    const processes = snapshot?.Processes ?? [];
    const server = processes.find((x) => x.Role === 'server');
    const runners = processes.filter((x) => x.Role !== 'server');
    const runnerCpu = runners.map((x) => x.CpuUsage).filter((x): x is number => x != null);

    const sample: TelemetrySample = {
      time: now,
      uploadSpeed,
      downloadSpeed,
      readSpeed,
      machineCpu: snapshot?.Machine.CpuUsage ?? null,
      serverCpu: server?.CpuUsage ?? null,
      serverMemory: server?.WorkingSet ?? null,
      managedHeap: server?.ManagedHeapSize ?? null,
      runnerCpu: runnerCpu.length > 0 ? runnerCpu.reduce((a, b) => a + b, 0) : null,
      runnerMemory: runners.length > 0 ? runners.reduce((a, b) => a + b.WorkingSet, 0) : null,
    };

    this.#history.update((samples) => {
      const cutoff = now - HISTORY_RETENTION_MS;
      const firstKept = samples.findIndex((x) => x.time >= cutoff);
      const kept = firstKept < 0 ? [] : firstKept === 0 ? samples : samples.slice(firstKept);
      return [...kept, sample];
    });
  }

  /**
   * Adds the progress made on each transfer since the last sample to the totals for the task.
   * A baseline only records the current progress, as earlier progress was not observed.
   */
  /**
   * Takes the transferred totals from the server, and returns what was transferred since the last sample
   */
  #transfersFromTotals(taskId: number | null, totals: { uploaded: number; downloaded: number }, isBaseline: boolean) {
    const last = this.#lastServerTotals;
    const comparable = !isBaseline && last !== null && last.taskId === taskId;
    this.#lastServerTotals = { taskId, ...totals };
    this.#transferTotals.set({ taskId, ...totals });

    return {
      uploaded: comparable ? Math.max(0, totals.uploaded - last.uploaded) : 0,
      downloaded: comparable ? Math.max(0, totals.downloaded - last.downloaded) : 0,
    };
  }

  #accumulateTransfers(taskId: number | null, transfers: ActiveTransfer[], isBaseline: boolean) {
    let uploaded = 0;
    let downloaded = 0;

    const totals = this.#transferTotals();
    if (isBaseline || totals.taskId !== taskId) this.#lastTransferProgress.clear();

    const seen = new Map<string, number>();
    for (const transfer of transfers) {
      const key = `${transfer.BackendAction}:${transfer.BackendPath}`;
      const current = Math.max(0, transfer.BackendFileProgress ?? 0);
      const delta = isBaseline ? 0 : Math.max(0, current - (this.#lastTransferProgress.get(key) ?? 0));
      seen.set(key, current);

      if (UPLOAD_ACTIONS.has(transfer.BackendAction ?? '')) uploaded += delta;
      else if (DOWNLOAD_ACTIONS.has(transfer.BackendAction ?? '')) downloaded += delta;
    }
    this.#lastTransferProgress = seen;

    // Keep the totals of the last task when no task is running
    if (taskId === null) return { uploaded, downloaded };

    this.#transferTotals.set(
      totals.taskId === taskId
        ? { taskId, uploaded: totals.uploaded + uploaded, downloaded: totals.downloaded + downloaded }
        : { taskId, uploaded, downloaded }
    );

    return { uploaded, downloaded };
  }

  #calculateETA() {
    if (!this.#viewActivatedAt) return;

    const statusData = this.#statusBarState.statusData();
    if (!statusData) return;

    // Start measuring when a task starts after the view was opened, or when a new task starts
    const taskId = statusData.TaskID ?? null;
    if (!this.#initialProgress || taskId !== this.#etaTaskId) {
      this.#etaTaskId = taskId;
      this.#viewActivatedAt = new Date();
      this.#initialProgress = {
        files: statusData.ProcessedFileCount ?? 0,
        bytes: statusData.ProcessedFileSize ?? 0,
      };
      this.#etaData.set(null);
      return;
    }

    const now = new Date();
    const elapsedSeconds = (now.getTime() - this.#viewActivatedAt.getTime()) / 1000;

    // Wait for minimum elapsed time (5 seconds)
    if (elapsedSeconds < 5) return;

    const currentProcessedFiles = statusData.ProcessedFileCount || 0;
    const currentProcessedBytes = statusData.ProcessedFileSize || 0;

    const filesProcessedSinceStart = currentProcessedFiles - this.#initialProgress.files;
    const bytesProcessedSinceStart = currentProcessedBytes - this.#initialProgress.bytes;

    const filesPerSecond = filesProcessedSinceStart / elapsedSeconds;
    const bytesPerSecond = bytesProcessedSinceStart / elapsedSeconds;

    const remainingFiles = Math.max(0, (statusData.TotalFileCount || 0) - currentProcessedFiles);
    const remainingBytes = Math.max(0, (statusData.TotalFileSize || 0) - currentProcessedBytes);

    let etaFiles: number | null = null;
    let etaBytes: number | null = null;

    if (filesPerSecond > 0) {
      etaFiles = remainingFiles / filesPerSecond;
    }

    if (bytesPerSecond > 0) {
      etaBytes = remainingBytes / bytesPerSecond;
    }

    let estimatedCompletion: Date | null = null;
    let metric: 'files' | 'bytes' = 'bytes';

    if (etaFiles !== null && etaBytes !== null) {
      const etaSeconds = Math.max(etaFiles, etaBytes);
      estimatedCompletion = new Date(now.getTime() + etaSeconds * 1000);
      metric = etaFiles > etaBytes ? 'files' : 'bytes';
    } else if (etaFiles !== null) {
      estimatedCompletion = new Date(now.getTime() + etaFiles * 1000);
      metric = 'files';
    } else if (etaBytes !== null) {
      estimatedCompletion = new Date(now.getTime() + etaBytes * 1000);
      metric = 'bytes';
    }

    this.#etaData.set({
      startTime: this.#viewActivatedAt,
      filesProcessedAtStart: this.#initialProgress.files,
      bytesProcessedAtStart: this.#initialProgress.bytes,
      currentFilesPerSecond: filesPerSecond,
      currentBytesPerSecond: bytesPerSecond,
      estimatedCompletion,
      metric,
    });
  }
}
