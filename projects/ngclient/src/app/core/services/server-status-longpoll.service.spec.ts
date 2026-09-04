import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisconnectedDialogComponent } from '../components/disconnected-dialog/disconnected-dialog.component';
import { DuplicatiServer, ServerStatusDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';
import { ServerStatusLongPollService } from './server-status-longpoll.service';

describe('ServerStatusLongPollService', () => {
  let service: ServerStatusLongPollService | undefined;

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    service?.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  const setup = (relayIsEnabled = false) => {
    const requests: Subject<ServerStatusDto>[] = [];
    const getServerState = vi.fn(() => {
      const request = new Subject<ServerStatusDto>();
      requests.push(request);
      return request;
    });
    const dialogRef = {
      component: { reconnectTimer: signal(0) },
      close: vi.fn(),
    };
    const dialog = {
      open: vi.fn(() => dialogRef),
    };

    TestBed.configureTestingModule({
      providers: [
        ServerStatusLongPollService,
        { provide: DuplicatiServer, useValue: { getApiV1Serverstate: getServerState } },
        { provide: ShipDialogService, useValue: dialog },
        { provide: RelayconfigState, useValue: { relayIsEnabled: signal(relayIsEnabled) } },
      ],
    });

    service = TestBed.inject(ServerStatusLongPollService);
    return { service, requests, getServerState, dialog, dialogRef };
  };

  it.each([
    { relayIsEnabled: false, duration: '299s' },
    { relayIsEnabled: true, duration: '94s' },
  ])('starts the initial poll with the expected duration: $duration', ({ relayIsEnabled, duration }) => {
    const { service, getServerState } = setup(relayIsEnabled);

    service.start();

    expect(getServerState).toHaveBeenCalledWith({
      query: {
        lastEventId: -1,
        longpoll: false,
        duration,
      },
    });
  });

  it('updates the state and uses the event ID for the next poll', () => {
    const { service, requests, getServerState } = setup();
    const response = { LastEventID: 42 } as ServerStatusDto;
    service.start();

    requests[0].next(response);
    requests[0].complete();

    expect(service.serverState()).toBe(response);
    expect(service.connectionStatus()).toBe('connecting');
    expect(getServerState).toHaveBeenCalledTimes(2);
    expect(getServerState).toHaveBeenLastCalledWith({
      query: {
        lastEventId: 42,
        longpoll: true,
        duration: '299s',
      },
    });
  });

  it('opens one dialog and retries five seconds after an error', async () => {
    const { service, requests, getServerState, dialog, dialogRef } = setup();
    service.start();

    requests[0].error(new Error('offline'));

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open).toHaveBeenCalledWith(DisconnectedDialogComponent, {
      closeOnButton: false,
      closeOnEsc: false,
      closeOnOutsideClick: false,
    });
    expect(dialogRef.component.reconnectTimer()).toBe(5000);

    await vi.advanceTimersByTimeAsync(4999);
    expect(getServerState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getServerState).toHaveBeenCalledTimes(2);
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('marks the connection disconnected after four failures and resets after recovery', async () => {
    const { service, requests, dialogRef } = setup();
    service.start();

    for (let index = 0; index < 4; index++) {
      requests[index].error(new Error(`offline ${index + 1}`));
      if (index < 3) await vi.advanceTimersByTimeAsync(5000);
    }

    expect(service.connectionStatus()).toBe('disconnected');

    await vi.advanceTimersByTimeAsync(5000);
    const recovery = { LastEventID: 7 } as ServerStatusDto;
    requests[4].next(recovery);
    requests[4].complete();

    expect(service.connectionStatus()).toBe('connecting');
    expect(service.serverState()).toBe(recovery);
    expect(dialogRef.close).toHaveBeenCalledTimes(1);

    requests[5].error(new Error('offline again'));
    expect(service.connectionStatus()).toBe('connecting');
  });

  it('cancels a pending retry and closes its dialog when stopped', async () => {
    const { service, requests, getServerState, dialogRef } = setup();
    service.start();
    requests[0].error(new Error('offline'));

    service.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(getServerState).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });

  it('ignores an in-flight response after polling is stopped', () => {
    const { service, requests, getServerState } = setup();
    service.start();

    service.stop();
    requests[0].next({ LastEventID: 42 } as ServerStatusDto);
    requests[0].complete();

    expect(service.serverState()).toBeNull();
    expect(getServerState).toHaveBeenCalledTimes(1);
  });

  it('reconnects once without retaining an earlier retry', async () => {
    const { service, requests, getServerState, dialogRef } = setup();
    service.start();
    requests[0].error(new Error('offline'));

    service.reconnect();

    expect(getServerState).toHaveBeenCalledTimes(2);
    expect(dialogRef.close).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getServerState).toHaveBeenCalledTimes(2);
  });
});
