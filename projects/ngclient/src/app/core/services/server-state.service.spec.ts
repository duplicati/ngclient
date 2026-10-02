import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { finalize, Observable, of, Subject } from 'rxjs';
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
    const getTask = vi.fn((): Observable<GetTaskStateDto> => {
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
    const task = { ID: 7, Status: 'Completed', TaskFinished: '2026-09-04T12:00:00Z' } as GetTaskStateDto;

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
    const task = { ID: 8, Status: 'Completed', TaskFinished: '2026-09-04T12:00:00Z' } as GetTaskStateDto;
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

    requests[0].next({ ID: 9, Status: 'Running', TaskFinished: null } as GetTaskStateDto);
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
    const task = { ID: 10, Status: 'Completed', TaskFinished: '2026-09-04T12:00:00Z' } as GetTaskStateDto;

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

  it.each(['Completed', 'Failed'])('waits for %s after Running with a finish timestamp', async (status) => {
    const { service, requests, getTask } = setup();
    const next = vi.fn();
    const complete = vi.fn();
    const secondNext = vi.fn();
    service.waitForTaskToComplete(13).subscribe({ next, complete });
    requests[0].next({ ID: 13, Status: 'Running', TaskFinished: '2026-09-13T04:14:47.898Z', ErrorMessage: null });
    requests[0].complete();

    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    service.waitForTaskToComplete(13).subscribe(secondNext);
    expect(secondNext).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(getTask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getTask).toHaveBeenCalledTimes(2);

    const task = {
      ID: 13,
      Status: status,
      TaskFinished: '2026-09-13T04:14:47.898Z',
      ErrorMessage: status === 'Failed' ? 'Wrong passphrase' : null,
    };
    requests[1].next(task);
    requests[1].complete();
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    expect(secondNext).toHaveBeenCalledExactlyOnceWith(task);
    expect(complete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getTask).toHaveBeenCalledTimes(2);
  });

  it('does not finish a Waiting task even when a finish timestamp is present', async () => {
    const { service, requests, getTask } = setup();
    const next = vi.fn();
    const complete = vi.fn();
    service.waitForTaskToComplete(14).subscribe({ next, complete });
    requests[0].next({ ID: 14, Status: 'Waiting', TaskFinished: '2026-09-13T04:14:47.898Z' });
    requests[0].complete();
    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(getTask).toHaveBeenCalledTimes(2);
  });

  it.each(['longpoll', 'websocket'] as const)('delivers and caches a Failed task through %s', (transport) => {
    const { service, requests, taskCompleted, getTask } = setup(transport === 'websocket');
    service.setConnectionMethod(transport);
    const next = vi.fn();
    const complete = vi.fn();
    const error = vi.fn();
    const cachedNext = vi.fn();
    const cachedComplete = vi.fn();
    const task: GetTaskStateDto = {
      ID: 15,
      Status: 'Failed',
      TaskFinished: '2026-09-13T04:14:47.898Z',
      ErrorMessage: 'Wrong passphrase',
      Exception: 'Repair exception details',
    };
    service.waitForTaskToComplete(15).subscribe({ next, complete, error });
    if (transport === 'websocket') {
      taskCompleted.next(task);
    } else {
      requests[0].next(task);
      requests[0].complete();
    }
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    service.waitForTaskToComplete(15).subscribe({ next: cachedNext, complete: cachedComplete });
    expect(cachedNext).toHaveBeenCalledExactlyOnceWith(task);
    expect(cachedComplete).toHaveBeenCalledTimes(1);
    expect(getTask).toHaveBeenCalledTimes(transport === 'websocket' ? 0 : 1);
  });

  it('does not poll when websocket task completion notifications are available', async () => {
    const { service, getTask } = setup(true);
    service.setConnectionMethod('websocket');

    service.waitForTaskToComplete(12).subscribe();
    await vi.advanceTimersByTimeAsync(5000);

    expect(getTask).not.toHaveBeenCalled();
  });

  it.each(['response', 'error'])('clears the pending %s timer when the last waiter unsubscribes', async (outcome) => {
    const { service, requests, getTask } = setup();
    const subscription = service.waitForTaskToComplete(20).subscribe();
    if (outcome === 'response') {
      requests[0].next({ ID: 20, Status: 'Running' });
      requests[0].complete();
    } else {
      requests[0].error(new Error('temporary failure'));
    }
    expect(vi.getTimerCount()).toBe(1);
    subscription.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(getTask).toHaveBeenCalledTimes(1);
  });

  it('releases an in-flight request and ignores late events after the last waiter unsubscribes', async () => {
    const { service, getTask } = setup();
    const response = new Subject<GetTaskStateDto>();
    const released = vi.fn();
    getTask.mockReturnValue(response.pipe(finalize(released)));
    const next = vi.fn();
    const complete = vi.fn();
    const subscription = service.waitForTaskToComplete(21).subscribe({ next, complete });
    subscription.unsubscribe();
    expect(released).toHaveBeenCalledTimes(1);
    response.next({ ID: 21, Status: 'Completed' });
    response.error(new Error('late error'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(getTask).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['longpoll', 'websocket'] as const)('keeps the other waiter for the same task through %s', (transport) => {
    const { service, requests, taskCompleted } = setup(transport === 'websocket');
    service.setConnectionMethod(transport);
    const cancelledNext = vi.fn();
    const cancelledComplete = vi.fn();
    const next = vi.fn();
    const complete = vi.fn();
    const subscription = service
      .waitForTaskToComplete(22)
      .subscribe({ next: cancelledNext, complete: cancelledComplete });
    service.waitForTaskToComplete(22).subscribe({ next, complete });
    subscription.unsubscribe();
    const task: GetTaskStateDto = { ID: 22, Status: 'Completed' };
    if (transport === 'websocket') taskCompleted.next(task);
    else {
      requests[0].next(task);
      requests[0].complete();
    }
    expect(cancelledNext).not.toHaveBeenCalled();
    expect(cancelledComplete).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('moves polling to another task when the in-flight task loses its last waiter', async () => {
    const { service, requests, getTask } = setup();
    const cancelled = service.waitForTaskToComplete(23).subscribe();
    const next = vi.fn();
    const complete = vi.fn();
    service.waitForTaskToComplete(24).subscribe({ next, complete });
    cancelled.unsubscribe();
    expect(getTask).toHaveBeenCalledTimes(2);
    expect(getTask).toHaveBeenLastCalledWith({ path: { taskid: 24 } });
    requests[0].next({ ID: 23, Status: 'Completed' });
    requests[0].complete();
    expect(next).not.toHaveBeenCalled();
    const task: GetTaskStateDto = { ID: 24, Status: 'Completed' };
    requests[1].next(task);
    requests[1].complete();
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    expect(complete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(getTask).toHaveBeenCalledTimes(2);
  });

  it('retains the one-second polling interval between normally completed tasks', async () => {
    const { service, requests, getTask } = setup();
    service.waitForTaskToComplete(30).subscribe();
    const next = vi.fn();
    service.waitForTaskToComplete(31).subscribe(next);
    requests[0].next({ ID: 30, Status: 'Completed' });
    requests[0].complete();
    await vi.advanceTimersByTimeAsync(999);
    expect(getTask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getTask).toHaveBeenCalledTimes(2);
    expect(getTask).toHaveBeenLastCalledWith({ path: { taskid: 31 } });
    const task: GetTaskStateDto = { ID: 31, Status: 'Completed' };
    requests[1].next(task);
    requests[1].complete();
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a fresh wait after cancellation without reviving the old request', async () => {
    const { service, requests, getTask } = setup();
    service.waitForTaskToComplete(25).subscribe().unsubscribe();
    const next = vi.fn();
    service.waitForTaskToComplete(26).subscribe(next);
    expect(getTask).toHaveBeenCalledTimes(2);
    requests[0].error(new Error('stale request'));
    requests[1].next({ ID: 26, Status: 'Running' });
    requests[1].complete();
    await vi.advanceTimersByTimeAsync(1000);
    expect(getTask).toHaveBeenCalledTimes(3);
    expect(getTask).toHaveBeenLastCalledWith({ path: { taskid: 26 } });
    const task: GetTaskStateDto = { ID: 26, Status: 'Completed' };
    requests[2].next(task);
    requests[2].complete();
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    await vi.advanceTimersByTimeAsync(5000);
    expect(getTask).toHaveBeenCalledTimes(3);
  });

  it('releases synchronous successful requests and can start another task', async () => {
    const { service, getTask } = setup();
    const released = vi.fn();
    getTask.mockImplementation(() => of({ ID: 27, Status: 'Completed' }).pipe(finalize(released)));
    const next = vi.fn();
    const complete = vi.fn();
    service.waitForTaskToComplete(27).subscribe({ next, complete });
    expect(next).toHaveBeenCalledExactlyOnceWith({ ID: 27, Status: 'Completed' });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    getTask.mockImplementation(() => of({ ID: 28, Status: 'Completed' }));
    service.waitForTaskToComplete(28).subscribe();
    expect(getTask).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(getTask).toHaveBeenCalledTimes(2);
  });
});
