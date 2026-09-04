import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, GetTaskStateDto, ServerStatusDto } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';
import { ServerStateService } from './server-state.service';
import { ServerStatusLongPollService } from './server-status-longpoll.service';
import { ServerStatusWebSocketService } from './server-status-websocket.service';

describe('ServerStateService', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  const setup = (hasTaskCompletedOption = false) => {
    const taskCompleted = new Subject<GetTaskStateDto>();
    const websocketState = { LastEventID: 11 } as ServerStatusDto;
    const longPollState = {
      LastEventID: 22,
      SchedulerQueueIds: [{ Item1: 31 }, { Item1: null }],
    } as ServerStatusDto;
    const websocket = {
      connectionStatus: signal('connected'),
      serverState: signal<ServerStatusDto | null>(websocketState),
      serverProgress: signal(null),
      serverTaskQueue: signal<GetTaskStateDto[] | null>([{ ID: 41 }, { ID: 0 }, {}]),
      backupListState: signal(null),
      taskCompleted,
      reconnectIfNeeded: vi.fn(),
      stop: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    const longPoll = {
      connectionStatus: signal('disconnected'),
      serverState: signal<ServerStatusDto | null>(longPollState),
      reconnectIfNeeded: vi.fn(),
      stop: vi.fn(),
    };
    const requests: Subject<GetTaskStateDto>[] = [];
    const getTask = vi.fn(() => {
      const request = new Subject<GetTaskStateDto>();
      requests.push(request);
      return request;
    });

    TestBed.configureTestingModule({
      providers: [
        ServerStateService,
        { provide: ServerStatusWebSocketService, useValue: websocket },
        { provide: ServerStatusLongPollService, useValue: longPoll },
        { provide: DuplicatiServer, useValue: { getApiV1TaskByTaskid: getTask } },
        { provide: SysinfoState, useValue: { hasTaskCompletedOption: signal(hasTaskCompletedOption) } },
      ],
    });

    const service = TestBed.inject(ServerStateService);
    return { service, websocket, longPoll, taskCompleted, requests, getTask, websocketState, longPollState };
  };

  it('subscribes to task completions and delegates websocket subscriptions', () => {
    const { service, websocket } = setup();
    const data = { backupId: '1' };

    expect(websocket.subscribe).toHaveBeenCalledWith('taskcompleted');

    service.subscribe('progress', data);
    service.unsubscribe('progress');

    expect(websocket.subscribe).toHaveBeenCalledWith('progress', data);
    expect(websocket.unsubscribe).toHaveBeenCalledWith('progress');
  });

  it('routes connection state and active tasks through the selected transport', () => {
    const { service, websocket, longPoll, websocketState, longPollState } = setup();

    expect(service.getConnectionMethod()).toBe('longpoll');
    expect(service.isConnectionMethodSet()).toBe(false);
    expect(service.connectionStatus()).toBe('disconnected');
    expect(service.serverState()).toBe(longPollState);
    expect(service.activeTaskQueueState()).toEqual([31]);

    service.setConnectionMethod('websocket');

    expect(websocket.reconnectIfNeeded).toHaveBeenCalledTimes(1);
    expect(longPoll.stop).toHaveBeenCalledTimes(1);
    expect(service.getConnectionMethod()).toBe('websocket');
    expect(service.isConnectionMethodSet()).toBe(true);
    expect(service.connectionStatus()).toBe('connected');
    expect(service.serverState()).toBe(websocketState);
    expect(service.activeTaskQueueState()).toEqual([41]);

    service.setConnectionMethod('longpoll');

    expect(longPoll.reconnectIfNeeded).toHaveBeenCalledTimes(1);
    expect(websocket.stop).toHaveBeenCalledTimes(1);
    expect(service.getConnectionMethod()).toBe('longpoll');
  });

  it('completes every waiter from a websocket task notification without polling', () => {
    const { service, taskCompleted, getTask } = setup(true);
    service.setConnectionMethod('websocket');
    const firstNext = vi.fn();
    const firstComplete = vi.fn();
    const secondNext = vi.fn();
    const secondComplete = vi.fn();
    const task = { ID: 7, TaskFinished: '2026-09-04T12:00:00Z' } as GetTaskStateDto;

    service.waitForTaskToComplete(7).subscribe({ next: firstNext, complete: firstComplete });
    service.waitForTaskToComplete(7).subscribe({ next: secondNext, complete: secondComplete });

    expect(getTask).not.toHaveBeenCalled();

    taskCompleted.next(task);

    expect(firstNext).toHaveBeenCalledWith(task);
    expect(secondNext).toHaveBeenCalledWith(task);
    expect(firstComplete).toHaveBeenCalledTimes(1);
    expect(secondComplete).toHaveBeenCalledTimes(1);
  });

  it('returns an already completed websocket task from the recent cache', () => {
    const { service, taskCompleted, getTask } = setup(true);
    const task = { ID: 8, TaskFinished: '2026-09-04T12:00:00Z' } as GetTaskStateDto;
    const next = vi.fn();
    const complete = vi.fn();

    taskCompleted.next(task);
    service.waitForTaskToComplete(8).subscribe({ next, complete });

    expect(next).toHaveBeenCalledWith(task);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(getTask).not.toHaveBeenCalled();
  });

  it('polls immediately and checks an unfinished task again after one second', async () => {
    const { service, requests, getTask } = setup();
    service.waitForTaskToComplete(9).subscribe();

    expect(getTask).toHaveBeenCalledWith({ path: { taskid: 9 } });

    requests[0].next({ ID: 9, TaskFinished: null } as GetTaskStateDto);
    requests[0].complete();

    await vi.advanceTimersByTimeAsync(999);
    expect(getTask).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getTask).toHaveBeenCalledTimes(2);
    expect(getTask).toHaveBeenLastCalledWith({ path: { taskid: 9 } });
  });

  it('completes all polling waiters, caches the result, and stops when no tasks remain', async () => {
    const { service, requests, getTask } = setup();
    const firstNext = vi.fn();
    const firstComplete = vi.fn();
    const secondNext = vi.fn();
    const secondComplete = vi.fn();
    const cachedNext = vi.fn();
    const task = { ID: 10, TaskFinished: '2026-09-04T12:00:00Z' } as GetTaskStateDto;

    service.waitForTaskToComplete(10).subscribe({ next: firstNext, complete: firstComplete });
    service.waitForTaskToComplete(10).subscribe({ next: secondNext, complete: secondComplete });
    requests[0].next(task);
    requests[0].complete();

    expect(firstNext).toHaveBeenCalledWith(task);
    expect(secondNext).toHaveBeenCalledWith(task);
    expect(firstComplete).toHaveBeenCalledTimes(1);
    expect(secondComplete).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(getTask).toHaveBeenCalledTimes(1);

    service.waitForTaskToComplete(10).subscribe(cachedNext);
    expect(cachedNext).toHaveBeenCalledWith(task);
    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it('retries polling three seconds after a request error', async () => {
    const { service, requests, getTask } = setup();
    service.waitForTaskToComplete(11).subscribe();

    requests[0].error(new Error('temporary failure'));

    await vi.advanceTimersByTimeAsync(2999);
    expect(getTask).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getTask).toHaveBeenCalledTimes(2);
    expect(getTask).toHaveBeenLastCalledWith({ path: { taskid: 11 } });
  });

  it('does not poll when websocket task completion notifications are available', async () => {
    const { service, getTask } = setup(true);
    service.setConnectionMethod('websocket');

    service.waitForTaskToComplete(12).subscribe();
    await vi.advanceTimersByTimeAsync(5000);

    expect(getTask).not.toHaveBeenCalled();
  });
});
