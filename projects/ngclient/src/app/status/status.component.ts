import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { defer } from 'rxjs';
import LogsLiveComponent from '../about/logs/logs-live/logs-live.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { resolveStatusText } from '../core/constants/status-states.constant';
import { ActiveFile, DuplicatiServer } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { BackupsState } from '../core/states/backups.state';
import { SystemStatusQueueItem } from '../core/types/system-status';
import { ServerSettingsService } from '../settings/server-settings.service';
import StatusChartComponent, { StatusChartSeries } from './status-chart/status-chart.component';
import { StatusPageState, TelemetrySample } from './status.state';
import { parseThrottleSpeed } from './throttle-speed';

const OPERATION_LABELS: Record<string, string> = {
  BackupOrSync: $localize`Backup`,
  Restore: $localize`Restore`,
  Repair: $localize`Repair`,
  RepairUpdate: $localize`Repair`,
  Verify: $localize`Verify`,
  Compact: $localize`Compact`,
  CreateReport: $localize`Bug report`,
  ListRemote: $localize`List remote`,
  Delete: $localize`Delete`,
  Vacuum: $localize`Vacuum`,
  DeleteVersions: $localize`Delete versions`,
  PurgeFiles: $localize`Purge files`,
  PurgeBrokenFiles: $localize`Purge broken files`,
  ListBrokenFiles: $localize`List broken files`,
  RestoreTest: $localize`Restore test`,
  CustomRunner: $localize`Task`,
};

const OPERATION_CLASSES: Record<string, string> = {
  BackupOrSync: 'backup',
  Restore: 'restore',
  Verify: 'verify',
  RestoreTest: 'verify',
  Compact: 'maintenance',
  Vacuum: 'maintenance',
  Repair: 'maintenance',
  RepairUpdate: 'maintenance',
};

@Component({
  selector: 'app-status',
  imports: [
    ShipCard,
    ShipProgressBar,
    ShipButton,
    ShipButtonGroup,
    ShipIcon,
    BytesPipe,
    RelativeTimePipe,
    DatePipe,
    DecimalPipe,
    PercentPipe,
    LogsLiveComponent,
    StatusChartComponent,
    StatusBarComponent,
  ],
  templateUrl: './status.component.html',
  styleUrl: './status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusComponent implements OnInit, OnDestroy {
  #statusBarState = inject(StatusBarState);
  #statusPageState = inject(StatusPageState);
  #backupsState = inject(BackupsState);
  #dupServer = inject(DuplicatiServer);
  #bytesPipe = inject(BytesPipe);
  #serverSettings = inject(ServerSettingsService);

  /** The active transfer throttles in bytes per second, or null for a direction that is not throttled */
  throttle = computed(() => {
    const settings = this.#serverSettings.serverSettings();
    return {
      upload: parseThrottleSpeed(settings?.['max-upload-speed']),
      download: parseThrottleSpeed(settings?.['max-download-speed']),
    };
  });

  /** The active throttles as one line of text, or null when no throttle is set */
  throttleText = computed(() => {
    const { upload, download } = this.throttle();
    const limits: string[] = [];
    if (upload) limits.push(`${this.#bytesPipe.transform(upload)}/s ↑`);
    if (download) limits.push(`${this.#bytesPipe.transform(download)}/s ↓`);
    if (limits.length === 0) return null;

    const joined = limits.join(' ');
    return $localize`Throttled to ${joined}:limits:`;
  });

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;
  clientIsRunning = this.#statusBarState.clientIsRunning;

  page = this.#statusPageState;
  recentFiles = this.#statusPageState.recentFiles;
  etaData = this.#statusPageState.etaData;
  progressData = this.#statusPageState.progress;
  queue = this.#statusPageState.queue;
  hasSystemStatus = this.#statusPageState.hasSystemStatus;
  machine = this.#statusPageState.machine;
  serverProcess = this.#statusPageState.serverProcess;
  controllerProcesses = this.#statusPageState.controllerProcesses;
  threadCount = this.#statusPageState.threadCount;
  hasRunner = this.#statusPageState.hasRunner;
  activeTransfers = this.#statusPageState.activeTransfers;
  activeFiles = this.#statusPageState.activeFiles;
  transferTotals = this.#statusPageState.transferTotals;
  latestSample = this.#statusPageState.latestSample;
  historyWindow = this.#statusPageState.historyWindow;
  historyWindowMs = this.#statusPageState.historyWindowMs;
  /** A few missed samples are still drawn as a line; longer gaps break it */
  maxGapMs = computed(() => this.#statusPageState.sampleIntervalMs() * 5);

  isTaskRunning = computed(() => !!this.serverState()?.ActiveTask || !!this.progressData()?.TaskID);

  statusText = computed(() => resolveStatusText(this.progressData()?.Phase, $localize`Running task`));

  progress = computed(() => {
    // The status bar estimate covers the phases where the server reports no overall progress
    const estimate = this.statusData()?.progress;
    const value = estimate != null && estimate >= 0 ? estimate : this.progressData()?.OverallProgress || 0;
    return Math.max(0, Math.min(100, value * 100));
  });

  runningTask = computed(() => this.queue().find((x) => x.Status === 'Running') ?? null);
  waitingTasks = computed(() => this.queue().filter((x) => x.Status !== 'Running'));

  taskName = computed(() => {
    const task = this.runningTask();
    if (task?.BackupName) return task.BackupName;
    return this.statusData()?.backup?.Backup?.Name ?? $localize`Running task`;
  });

  estimatedCompletion = computed(() => {
    // Prefer the server estimate, which is smoothed over the whole operation
    const eta = this.progressData()?.EstimatedTimeToCompletion;
    const seconds = eta ? parseTimeSpan(eta) : null;
    if (seconds !== null && seconds > 0) return new Date(Date.now() + seconds * 1000);
    return this.etaData()?.estimatedCompletion ?? null;
  });

  nextBackup = computed(() => {
    const next = this.serverState()?.ProposedSchedule?.[0];
    if (!next) return null;

    // Looked up here so the name appears when the backup list loads after the server state
    const id = next.Item1 ?? null;
    const name = id ? (this.#backupsState.getBackupById(id)?.Backup?.Name ?? null) : null;
    return { name, time: next.Item2 };
  });

  peakUpload = computed(() => Math.max(0, ...this.#statusPageState.visibleHistory().map((x) => x.uploadSpeed ?? 0)));

  networkSeries = computed<StatusChartSeries[]>(() => [
    {
      label: $localize`Upload`,
      color: 'var(--primary-8)',
      fill: true,
      points: this.#points((x) => x.uploadSpeed),
    },
    {
      label: $localize`Download`,
      color: 'var(--accent-8)',
      fill: true,
      points: this.#points((x) => x.downloadSpeed),
    },
  ]);

  cpuSeries = computed<StatusChartSeries[]>(() => {
    const hasRunner = this.hasRunner();
    return [
      { label: $localize`System total`, color: 'var(--base-7)', points: this.#points((x) => x.machineCpu) },
      {
        label: hasRunner ? $localize`Server` : $localize`Duplicati`,
        color: 'var(--primary-8)',
        fill: true,
        points: this.#points((x) => x.serverCpu),
      },
      ...(hasRunner
        ? [{ label: $localize`Runner`, color: 'var(--accent-8)', fill: true, points: this.#points((x) => x.runnerCpu) }]
        : []),
    ];
  });

  memorySeries = computed<StatusChartSeries[]>(() => {
    const hasRunner = this.hasRunner();
    return [
      {
        label: hasRunner ? $localize`Server` : $localize`Duplicati`,
        color: 'var(--success-8)',
        fill: true,
        points: this.#points((x) => x.serverMemory),
      },
      ...(hasRunner
        ? [
            {
              label: $localize`Runner`,
              color: 'var(--accent-8)',
              fill: true,
              points: this.#points((x) => x.runnerMemory),
            },
          ]
        : []),
      { label: $localize`Managed heap`, color: 'var(--base-7)', points: this.#points((x) => x.managedHeap) },
    ];
  });

  readStats = computed(() => {
    const values = this.#statusPageState
      .visibleHistory()
      .map((x) => x.readSpeed)
      .filter((x): x is number => x != null);
    if (values.length === 0) return { average: 0 };
    return { average: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
  });

  readSeries = computed<StatusChartSeries[]>(() => [
    { label: $localize`Source read`, color: 'var(--warn-8)', fill: true, points: this.#points((x) => x.readSpeed) },
  ]);

  formatSpeed = (value: number) => (value === 0 ? '0' : `${this.#bytesPipe.transform(value)}/s`);
  formatBytes = (value: number) => (value === 0 ? '0' : (this.#bytesPipe.transform(value) ?? ''));
  formatPercent = (value: number) => `${Math.round(value * 100)}%`;

  /** Ticks so relative times, such as the next scheduled run, stay current; the pipe is pure */
  now = signal(Date.now());
  #clock: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.#clock = setInterval(() => this.now.set(Date.now()), 10_000);
    this.#statusPageState.activateView();
    // Without a websocket the cached settings do not learn of a throttle set from the status bar
    this.#serverSettings.refreshServerSettings();
  }

  ngOnDestroy(): void {
    if (this.#clock) clearInterval(this.#clock);
    this.#statusPageState.deactivateView();
  }

  #points(pick: (sample: TelemetrySample) => number | null) {
    return this.#statusPageState.visibleHistory().map((x) => ({ time: x.time, value: pick(x) }));
  }

  operationLabel(item: SystemStatusQueueItem) {
    return OPERATION_LABELS[item.Operation] ?? item.Operation;
  }

  operationClass(item: SystemStatusQueueItem) {
    return OPERATION_CLASSES[item.Operation] ?? '';
  }

  queueItemName(item: SystemStatusQueueItem) {
    if (item.BackupName) return item.BackupName;
    if (item.BackupID) return this.#backupsState.getBackupById(item.BackupID)?.Backup?.Name ?? item.BackupID;
    return $localize`Task ${item.TaskID}`;
  }

  fileProgress(file: ActiveFile) {
    return file.Size ? Math.min(100, ((file.Offset ?? 0) / file.Size) * 100) : 0;
  }

  transferProgress(size: number | undefined, progress: number | undefined) {
    return size ? Math.min(100, ((progress ?? 0) / size) * 100) : 0;
  }

  splitPath(path: string | null | undefined) {
    if (!path) return { dir: '', name: '' };
    const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return idx < 0 ? { dir: '', name: path } : { dir: path.substring(0, idx + 1), name: path.substring(idx + 1) };
  }

  setHistoryWindow(value: string | null) {
    if (value === '1m' || value === '5m' || value === '15m') this.historyWindow.set(value);
  }

  stop() {
    const taskId = this.progressData()?.TaskID;
    if (!taskId) return;
    defer(() => this.#dupServer.postApiV1TaskByTaskidStop({ path: { taskid: taskId } })).subscribe();
  }

  abort() {
    const taskId = this.progressData()?.TaskID;
    if (!taskId) return;
    defer(() => this.#dupServer.postApiV1TaskByTaskidAbort({ path: { taskid: taskId } })).subscribe();
  }
}

/** Parses a .NET TimeSpan string, such as "1.02:03:04.5", into seconds */
export function parseTimeSpan(value: string): number | null {
  const match = /^(-)?(?:(\d+)\.)?(\d+):(\d+):(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, sign, days, hours, minutes, seconds, fraction] = match;
  const total =
    Number(days ?? 0) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    (fraction ? Number(`0.${fraction}`) : 0);
  return sign ? -total : total;
}
