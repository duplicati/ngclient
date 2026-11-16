import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ObservableInput, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DuplicatiServer,
  GetApiV1ProgressstateResponse as Progress,
  GetApiV1TaskByTaskidResponse as Task,
  ServerStatusDto,
} from '../../openapi';
import { BytesPipe } from '../../pipes/byte.pipe';
import { ServerStateService } from '../../services/server-state.service';
import { BackupsState } from '../../states/backups.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { StatusBarState } from './status-bar.state';

const progress = (id: number): Progress => ({
  TaskID: id,
  Phase: 'Backup_ProcessingFiles',
  ProcessedFileCount: 1,
  TotalFileCount: 10,
  ProcessedFileSize: 10,
  TotalFileSize: 100,
  CurrentFilecomplete: true,
  CurrentFilename: `current-${id}.txt`,
});

describe('StatusBarState progress read lifecycle', () => {
  let state: StatusBarState;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    state?.stopPollingProgress();
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  function setup() {
    const responses: Subject<Progress>[] = [];
    const tasks: Subject<Task>[] = [];
    const getProgress = vi.fn((): ObservableInput<Progress> => {
      const response = new Subject<Progress>();
      responses.push(response);
      return response;
    });
    const getTask = vi.fn((): ObservableInput<Task> => {
      const response = new Subject<Task>();
      tasks.push(response);
      return response;
    });
    const serverState = signal<Partial<ServerStatusDto>>({ ActiveTask: { Item1: 73, Item2: null } });
    const method = signal('longpoll');
    const pushed = signal<Progress | null>(null);
    const queue = signal<Task[]>([]);
    const hasProgress = signal(false);
    TestBed.configureTestingModule({
      providers: [
        StatusBarState,
        { provide: BytesPipe, useValue: { transform: String } },
        { provide: DuplicatiServer, useValue: { getApiV1Progressstate: getProgress, getApiV1TaskByTaskid: getTask } },
        { provide: BackupsState, useValue: { getBackups: vi.fn(), getBackupById: () => null } },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: SysinfoState, useValue: { hasProgressSubscribeOption: hasProgress } },
        {
          provide: ServerStateService,
          useValue: {
            serverState,
            progressState: pushed,
            taskQueueState: queue,
            connectionStatus: signal('connected'),
            getConnectionMethod: () => method(),
            subscribe: vi.fn(),
          },
        },
      ],
    });
    state = TestBed.inject(StatusBarState);
    TestBed.tick();
    return { responses, tasks, getProgress, getTask, serverState, method, pushed, queue, hasProgress };
  }

  it('keeps one read pending across both progress and task information requests', async () => {
    const { getProgress, responses, tasks } = setup();
    state.fetchProgressState();
    await vi.advanceTimersByTimeAsync(2500);
    expect(getProgress).toHaveBeenCalledTimes(1);
    responses[0].next(progress(73));
    responses[0].complete();
    state.fetchProgressState();
    await vi.advanceTimersByTimeAsync(2000);
    expect(getProgress).toHaveBeenCalledTimes(1);
    tasks[0].next({ ID: 73, Status: 'Running' });
    tasks[0].complete();
    expect(state.isFetching()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getProgress).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite a new task with the previous task information Promise', async () => {
    const { responses, tasks, getTask, serverState } = setup();
    let resolve!: (value: Task) => void;
    const previous = new Promise<Task>((done) => (resolve = done));
    getTask.mockReturnValueOnce(previous);
    state.fetchProgressState();
    responses[0].next(progress(73));
    responses[0].complete();
    serverState.set({ ActiveTask: { Item1: 74, Item2: null } });
    TestBed.tick();
    state.fetchProgressState();
    responses[1].next(progress(74));
    responses[1].complete();
    tasks[0].next({ ID: 74, Status: 'Running' });
    tasks[0].complete();
    resolve({ ID: 73, Status: 'Completed' });
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    expect(state.statusData()?.TaskID).toBe(74);
  });

  it('does not request old task information after its progress Promise becomes obsolete', async () => {
    const { getProgress, getTask, serverState } = setup();
    let resolve!: (value: Progress) => void;
    getProgress.mockReturnValueOnce(new Promise<Progress>((done) => (resolve = done)));
    state.fetchProgressState();
    serverState.set({ ActiveTask: { Item1: 74, Item2: null } });
    TestBed.tick();
    resolve(progress(73));
    await vi.advanceTimersByTimeAsync(0);
    expect(getTask).not.toHaveBeenCalled();
  });

  it('releases the pending read and loading state when polling is stopped', () => {
    const { responses } = setup();
    state.fetchProgressState();
    state.stopPollingProgress();
    expect(responses[0].observed).toBe(false);
    expect(state.isFetching()).toBe(false);
    responses[0].next(progress(73));
    expect(state.statusData()).toBeNull();
  });

  it('releases task information and timers on destruction without allowing restart', () => {
    const { responses, tasks, getProgress } = setup();
    state.fetchProgressState();
    responses[0].next(progress(73));
    responses[0].complete();
    TestBed.resetTestingModule();
    expect(tasks[0].observed).toBe(false);
    expect(state.isFetching()).toBe(false);
    state.startPollingProgress();
    state.fetchProgressState();
    expect(getProgress).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops REST reads when websocket progress becomes available', async () => {
    const { getProgress, responses, method, hasProgress, pushed, queue } = setup();
    state.fetchProgressState();
    method.set('websocket');
    hasProgress.set(true);
    TestBed.tick();
    expect(responses[0].observed).toBe(false);
    expect(state.pollingInterval).toBeUndefined();
    await vi.advanceTimersByTimeAsync(3000);
    expect(getProgress).toHaveBeenCalledTimes(1);
    queue.set([{ ID: 73, Status: 'Running' }]);
    pushed.set(progress(73));
    TestBed.tick();
    expect(state.statusData()?.TaskID).toBe(73);
  });

  it.each([404, 503])('preserves polling behavior after a current %s error', async (status) => {
    const { responses, getProgress } = setup();
    state.fetchProgressState();
    responses[0].error({ status });
    expect(state.isFetching()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getProgress).toHaveBeenCalledTimes(status === 404 ? 1 : 2);
  });

  it('does not release the current read or stop its timer when an old Promise fails', async () => {
    const { getProgress, serverState } = setup();
    let reject!: (reason: unknown) => void;
    getProgress.mockReturnValueOnce(new Promise<Progress>((_done, fail) => (reject = fail)));
    state.fetchProgressState();
    serverState.set({ ActiveTask: { Item1: 74, Item2: null } });
    TestBed.tick();
    state.fetchProgressState();
    reject({ status: 404 });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.isFetching()).toBe(true);
    expect(state.pollingInterval).toBeDefined();
  });

  it('does not replace an existing polling timer when start is repeated', () => {
    setup();
    const original = state.pollingInterval;
    state.startPollingProgress();
    state.startPollingProgress();
    expect(state.pollingInterval).toBe(original);
  });
});
