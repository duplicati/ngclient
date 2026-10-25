import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState, StatusWithContent } from '../core/components/status-bar/status-bar.state';
import { DuplicatiServer } from '../core/openapi';
import { ServerStateService } from '../core/services/server-state.service';
import { SysinfoState } from '../core/states/sysinfo.state';
import { SystemStatusSnapshot } from '../core/types/system-status';
import { StatusPageState } from './status.state';

describe('StatusPageState estimated totals', () => {
  let state: StatusPageState;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  });
  afterEach(() => {
    state?.deactivateView();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  const setup = () => {
    const progress = signal<StatusWithContent>({
      ProcessedFileCount: 0,
      ProcessedFileSize: 0,
      TotalFileCount: 10,
      TotalFileSize: 1000,
      progress: 0,
      statusText: '',
      fileStatusText: '',
      fileCountProgressText: '',
      actionText: '',
    });
    TestBed.configureTestingModule({
      providers: [
        StatusPageState,
        { provide: StatusBarState, useValue: { statusData: progress, serverState: signal(null) } },
        {
          provide: ServerStateService,
          useValue: {
            systemStatusState: signal(null),
            taskQueueState: signal(null),
            getConnectionMethod: () => 'longpoll',
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
          },
        },
        {
          provide: SysinfoState,
          useValue: { hasSystemStatus: signal(false) },
        },
        { provide: DuplicatiServer, useValue: {} },
      ],
    });
    state = TestBed.inject(StatusPageState);
    TestBed.tick();
    state.activateView();
    return progress;
  };

  it.each(['files', 'bytes'] as const)(
    'does not estimate a past completion from %s when processing exceeds the total',
    (metric) => {
      const progress = setup();
      progress.update((value) => ({
        ...value,
        TotalFileCount: 2,
        TotalFileSize: 100,
        ProcessedFileCount: metric === 'files' ? 5 : 0,
        ProcessedFileSize: metric === 'bytes' ? 200 : 0,
      }));
      vi.advanceTimersByTime(5000);
      expect(state.etaData()!.metric).toBe(metric);
      expect(state.etaData()!.estimatedCompletion?.getTime()).toBe(Date.now());
    }
  );

  it.each([0, -1])('does not estimate a past completion with total %s', (total) => {
    const progress = setup();
    progress.update((value) => ({
      ...value,
      TotalFileCount: total,
      TotalFileSize: total,
      ProcessedFileCount: 5,
      ProcessedFileSize: 200,
    }));
    vi.advanceTimersByTime(5000);
    expect(state.etaData()!.estimatedCompletion?.getTime()).toBe(Date.now());
  });

  it('retains positive rate calculations and the slower remaining-work estimate', () => {
    const progress = setup();
    progress.update((value) => ({ ...value, ProcessedFileCount: 5, ProcessedFileSize: 200 }));
    vi.advanceTimersByTime(5000);
    expect(state.etaData()!.currentFilesPerSecond).toBe(1);
    expect(state.etaData()!.currentBytesPerSecond).toBe(40);
    expect(state.etaData()!.metric).toBe('bytes');
    expect(state.etaData()!.estimatedCompletion?.getTime()).toBe(Date.now() + 20000);
  });

  it('does not estimate completion without a positive processing rate', () => {
    setup();
    vi.advanceTimersByTime(5000);
    expect(state.etaData()!.estimatedCompletion).toBeNull();
  });
});

describe('StatusPageState history', () => {
  let state: StatusPageState;
  let snapshot: ReturnType<typeof signal<SystemStatusSnapshot | null>>;
  let serverState: { subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  });
  afterEach(() => {
    state?.deactivateView();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  const makeSnapshot = (uploaded: number, processed: number, taskId = 1): SystemStatusSnapshot => ({
    Timestamp: new Date().toISOString(),
    IntervalMs: 1000,
    Machine: { ProcessorCount: 8, CpuUsage: 0.5, TotalMemory: 16e9, AvailableMemory: 8e9 },
    Processes: [
      {
        Role: 'server',
        ProcessId: 1,
        StartTime: null,
        CpuUsage: 0.25,
        WorkingSet: 500,
        PrivateMemory: 400,
        ManagedHeapSize: 200,
        ThreadCount: 10,
      },
      {
        Role: 'controller',
        ProcessId: 2,
        StartTime: null,
        CpuUsage: 0.1,
        WorkingSet: 300,
        PrivateMemory: 200,
        ManagedHeapSize: null,
        ThreadCount: 5,
      },
    ],
    Queue: [
      {
        TaskID: taskId,
        BackupID: '1',
        BackupName: 'Docs',
        Operation: 'BackupOrSync',
        Status: 'Running',
        TaskStarted: null,
      },
    ],
    Progress: {
      TaskID: taskId,
      ProcessedFileSize: processed,
      ActiveTransfers: [
        { BackendAction: 'Put', BackendPath: 'vol1', BackendFileSize: 10_000, BackendFileProgress: uploaded },
      ],
    },
  });

  const setup = () => {
    snapshot = signal<SystemStatusSnapshot | null>(null);
    serverState = { subscribe: vi.fn(), unsubscribe: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        StatusPageState,
        { provide: StatusBarState, useValue: { statusData: signal(null), serverState: signal(null) } },
        {
          provide: ServerStateService,
          useValue: {
            ...serverState,
            systemStatusState: snapshot,
            taskQueueState: signal(null),
            getConnectionMethod: () => 'websocket',
          },
        },
        {
          provide: SysinfoState,
          useValue: { hasSystemStatus: signal(true) },
        },
        { provide: DuplicatiServer, useValue: {} },
      ],
    });
    state = TestBed.inject(StatusPageState);
    state.activateView();
    TestBed.tick();
  };

  const push = (value: SystemStatusSnapshot) => {
    snapshot.set(value);
    TestBed.tick();
  };

  it('subscribes while the view is active and unsubscribes when it is left', () => {
    setup();
    expect(serverState.subscribe).toHaveBeenCalledWith('systemstatus');
    state.deactivateView();
    expect(serverState.unsubscribe).toHaveBeenCalledWith('systemstatus');
  });

  it('records a baseline first and then rates from the deltas', () => {
    setup();
    push(makeSnapshot(1000, 5000));
    expect(state.latestSample()!.uploadSpeed).toBeNull();
    expect(state.transferTotals().uploaded).toBe(0);

    vi.advanceTimersByTime(2000);
    push(makeSnapshot(5000, 9000));

    const sample = state.latestSample()!;
    expect(sample.uploadSpeed).toBe(2000);
    expect(sample.readSpeed).toBe(2000);
    expect(sample.serverCpu).toBe(0.25);
    expect(sample.runnerCpu).toBe(0.1);
    expect(sample.machineCpu).toBe(0.5);
    expect(sample.serverMemory).toBe(500);
    expect(sample.runnerMemory).toBe(300);
    expect(state.hasRunner()).toBe(true);
    expect(state.threadCount()).toBe(15);
    expect(sample.managedHeap).toBe(200);
    expect(state.transferTotals()).toEqual({ taskId: 1, uploaded: 4000, downloaded: 0 });
  });

  it('reports no runner when operations run in the server process', () => {
    setup();
    const value = makeSnapshot(0, 0);
    push({ ...value, Processes: value.Processes.filter((x) => x.Role === 'server') });
    expect(state.latestSample()!.runnerCpu).toBeNull();
    expect(state.latestSample()!.runnerMemory).toBeNull();
    expect(state.hasRunner()).toBe(false);
  });

  it('measures the read speed from the bytes read, not the processed size, when the server reports it', () => {
    setup();
    const withRead = (processed: number, read: number) => {
      const value = makeSnapshot(0, processed);
      return { ...value, Progress: { ...value.Progress, SourceBytesRead: read } } as SystemStatusSnapshot;
    };
    push(withRead(0, 0));
    vi.advanceTimersByTime(1000);
    // Unchanged files are processed without being read
    push(withRead(500_000_000, 0));
    expect(state.latestSample()!.readSpeed).toBe(0);
    vi.advanceTimersByTime(1000);
    push(withRead(500_004_000, 4000));
    expect(state.latestSample()!.readSpeed).toBe(4000);
  });

  it('counts transfers that complete between snapshots from the server totals', () => {
    setup();
    const withTotals = (uploaded: number, downloaded: number) => {
      const value = makeSnapshot(0, 0);
      return {
        ...value,
        Progress: {
          ...value.Progress,
          ActiveTransfers: [],
          BackendBytesUploaded: uploaded,
          BackendBytesDownloaded: downloaded,
        },
      } as SystemStatusSnapshot;
    };
    push(withTotals(0, 0));
    vi.advanceTimersByTime(2000);
    // A whole volume was uploaded between the snapshots, so it was never listed as active
    push(withTotals(50_000_000, 1_000_000));

    expect(state.latestSample()!.uploadSpeed).toBe(25_000_000);
    expect(state.latestSample()!.downloadSpeed).toBe(500_000);
    expect(state.transferTotals()).toEqual({ taskId: 1, uploaded: 50_000_000, downloaded: 1_000_000 });
  });

  it('starts new totals for a new task', () => {
    setup();
    push(makeSnapshot(1000, 0));
    vi.advanceTimersByTime(1000);
    push(makeSnapshot(3000, 0));
    vi.advanceTimersByTime(1000);
    push(makeSnapshot(500, 0, 2));
    expect(state.transferTotals()).toEqual({ taskId: 2, uploaded: 500, downloaded: 0 });
  });

  const withFiles = (files: { Path: string; Size: number; Offset: number }[] | null, current?: string) => {
    const value = makeSnapshot(0, 0);
    return {
      ...value,
      Progress: {
        ...value.Progress,
        ActiveFiles: files,
        CurrentFilename: current ?? files?.[0]?.Path ?? null,
        CurrentFilesize: 10,
        CurrentFileoffset: 5,
      },
    } as SystemStatusSnapshot;
  };

  it('lists the parallel files and records them as processed when they leave the list', () => {
    setup();
    push(
      withFiles([
        { Path: '/a', Size: 30, Offset: 10 },
        { Path: '/b', Size: 20, Offset: 0 },
      ])
    );
    expect(state.activeFiles().map((x) => x.Path)).toEqual(['/a', '/b']);
    expect(state.recentFiles()).toEqual([]);

    vi.advanceTimersByTime(1000);
    push(
      withFiles([
        { Path: '/b', Size: 20, Offset: 15 },
        { Path: '/c', Size: 10, Offset: 0 },
      ])
    );
    expect(state.recentFiles().map((x) => x.filename)).toEqual(['/a']);

    vi.advanceTimersByTime(1000);
    push(withFiles([]));
    expect(
      state
        .recentFiles()
        .map((x) => x.filename)
        .sort()
    ).toEqual(['/a', '/b', '/c']);
  });

  it('shows the single current file from servers without a list', () => {
    setup();
    push(withFiles(null, '/single'));
    expect(state.activeFiles()).toEqual([{ Path: '/single', Size: 10, Offset: 5 }]);
    expect(state.recentFiles().map((x) => x.filename)).toEqual(['/single']);
  });

  it('drops samples older than the retention and filters by window', () => {
    setup();
    push(makeSnapshot(0, 0));
    vi.advanceTimersByTime(10 * 60_000);
    push(makeSnapshot(0, 0));
    expect(state.visibleHistory().length).toBe(1);
    state.historyWindow.set('15m');
    expect(state.visibleHistory().length).toBe(2);
    vi.advanceTimersByTime(10 * 60_000);
    push(makeSnapshot(0, 0));
    expect(state.history().length).toBe(2);
  });
});

describe('StatusPageState polling', () => {
  let state: StatusPageState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  });
  afterEach(() => {
    state?.deactivateView();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  const setup = (hasEndpoint: boolean, intervalMs = 1000) => {
    let n = 0;
    const getApiV2SystemStatus = vi.fn(() =>
      of({
        Success: true,
        Error: null,
        StatusCode: 'OK',
        Data: {
          Timestamp: `2026-10-03T00:00:0${n++}Z`,
          IntervalMs: intervalMs,
          Machine: { ProcessorCount: 4, CpuUsage: 0.4, TotalMemory: 8e9, AvailableMemory: 2e9 },
          Processes: [],
          Queue: [
            { TaskID: 3, BackupID: '1', BackupName: 'Docs', Operation: 'Verify', Status: 'Waiting', TaskStarted: null },
          ],
          Progress: null,
        },
      })
    );
    const serverState = {
      systemStatusState: signal(null),
      taskQueueState: signal(null),
      getConnectionMethod: () => 'longpoll',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        StatusPageState,
        { provide: StatusBarState, useValue: { statusData: signal(null), serverState: signal(null) } },
        { provide: ServerStateService, useValue: serverState },
        {
          provide: SysinfoState,
          useValue: { hasSystemStatus: signal(hasEndpoint) },
        },
        { provide: DuplicatiServer, useValue: { getApiV2SystemStatus } },
      ],
    });
    state = TestBed.inject(StatusPageState);
    state.activateView();
    TestBed.tick();
    return { getApiV2SystemStatus, serverState };
  };

  it('polls the endpoint without a websocket and stops when the view is left', () => {
    const { getApiV2SystemStatus, serverState } = setup(true);
    expect(state.source()).toBe('polling');
    expect(serverState.subscribe).not.toHaveBeenCalled();
    expect(getApiV2SystemStatus).toHaveBeenCalledTimes(1);

    TestBed.tick();
    expect(state.queue()[0].BackupName).toBe('Docs');
    expect(state.machine()?.AvailableMemory).toBe(2e9);

    vi.advanceTimersByTime(2000);
    TestBed.tick();
    expect(getApiV2SystemStatus).toHaveBeenCalledTimes(3);
    expect(state.history().length).toBe(3);

    state.deactivateView();
    vi.advanceTimersByTime(5000);
    expect(getApiV2SystemStatus).toHaveBeenCalledTimes(3);
  });

  it('polls at the interval the server sends', () => {
    const { getApiV2SystemStatus } = setup(true, 3000);
    expect(state.sampleIntervalMs()).toBe(3000);
    vi.advanceTimersByTime(2000);
    expect(getApiV2SystemStatus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(getApiV2SystemStatus).toHaveBeenCalledTimes(2);
  });

  it('falls back to progress sampling on servers without the endpoint', () => {
    const { getApiV2SystemStatus } = setup(false);
    expect(state.source()).toBe('legacy');
    expect(state.hasSystemStatus()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(getApiV2SystemStatus).not.toHaveBeenCalled();
    expect(state.history().length).toBe(3);
  });
});

describe('StatusPageState without system status', () => {
  let state: StatusPageState;

  afterEach(() => {
    state?.deactivateView();
    TestBed.resetTestingModule();
  });

  const setup = () => {
    const statusData = signal<any>(null);
    const serverState = signal<any>(null);
    TestBed.configureTestingModule({
      providers: [
        StatusPageState,
        { provide: StatusBarState, useValue: { statusData, serverState } },
        {
          provide: ServerStateService,
          useValue: {
            systemStatusState: signal(null),
            taskQueueState: signal(null),
            getConnectionMethod: () => 'websocket',
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
          },
        },
        { provide: SysinfoState, useValue: { hasSystemStatus: signal(false) } },
        { provide: DuplicatiServer, useValue: {} },
      ],
    });
    state = TestBed.inject(StatusPageState);
    return { statusData, serverState };
  };

  it('uses the status bar progress while its task is active', () => {
    const { statusData, serverState } = setup();
    serverState.set({ ActiveTask: { Item1: 7, Item2: '1' } });
    statusData.set({ TaskID: 7, Phase: 'Backup_ProcessingFiles' });
    expect(state.source()).toBe('legacy');
    expect(state.progress()?.Phase).toBe('Backup_ProcessingFiles');
  });

  it('does not keep showing a task that has ended', () => {
    const { statusData, serverState } = setup();
    serverState.set({ ActiveTask: { Item1: 7, Item2: '1' } });
    statusData.set({ TaskID: 7, Phase: 'Backup_Complete' });
    // The server no longer reports the task, but the status bar keeps its last progress
    serverState.set({ ActiveTask: null });
    expect(state.progress()).toBeNull();
  });

  it('does not show the progress of a previous task for a new one', () => {
    const { statusData, serverState } = setup();
    statusData.set({ TaskID: 7, Phase: 'Backup_Complete' });
    serverState.set({ ActiveTask: { Item1: 8, Item2: '2' } });
    expect(state.progress()).toBeNull();
  });
});
