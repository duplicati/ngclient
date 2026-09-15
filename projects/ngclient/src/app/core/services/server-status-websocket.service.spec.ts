import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenOutputDto } from '../openapi';
import { AppAuthState } from '../states/app-auth.state';
import { SysinfoState } from '../states/sysinfo.state';
import { ServerStatusWebSocketService } from './server-status-websocket.service';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    // Browser close events arrive asynchronously.
    setTimeout(() => this.onclose?.({ code: 1000 }), 0);
  });

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  disconnect(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe('ServerStatusWebSocketService lifecycle', () => {
  let service: ServerStatusWebSocketService;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    service?.stop();
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const setup = (modernAuth = false) => {
    const refresh = new Subject<AccessTokenOutputDto>();
    const auth = { token: signal('token'), xsrfQueryParam: signal(null), refreshToken: vi.fn(() => refresh) };
    const dialogRef = { close: vi.fn(), component: { reconnectTimer: signal(0) } };
    const dialog = { open: vi.fn(() => dialogRef) };
    TestBed.configureTestingModule({
      providers: [
        ServerStatusWebSocketService,
        { provide: AppAuthState, useValue: auth },
        { provide: SysinfoState, useValue: { hasWebSocketAuth: () => modernAuth } },
        { provide: ShipDialogService, useValue: dialog },
      ],
    });
    service = TestBed.inject(ServerStatusWebSocketService);
    service.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    return { socket, refresh, auth, dialog, dialogRef };
  };

  const failAuth = (socket: FakeWebSocket, reason: string) => {
    if (reason === 'auth reply') socket.message({ Success: false, Message: 'Expired' });
    else socket.disconnect(4401);
  };

  it('retries a normal disconnect after five seconds and closes the dialog on connection', () => {
    const { socket, dialog, dialogRef } = setup();
    socket.disconnect();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialogRef.component.reconnectTimer()).toBe(5000);
    vi.advanceTimersByTime(4999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(service.connectionStatus()).toBe('connected');
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry and closes the disconnected dialog on stop', () => {
    const { socket, dialogRef } = setup();
    socket.disconnect();
    service.stop();
    vi.advanceTimersByTime(10000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
    expect(service.connectionStatus()).toBe('disconnected');
  });

  it('immediately disconnects and detaches all handlers when stopped', () => {
    const { socket } = setup();
    service.stop();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(service.connectionStatus()).toBe('disconnected');
    expect([socket.onopen, socket.onmessage, socket.onclose, socket.onerror]).toEqual([null, null, null, null]);
  });

  it.each(['auth reply', '4401'])('ignores successful refresh after stopping during %s', (reason) => {
    const { socket, refresh, auth, dialog } = setup(true);
    failAuth(socket, reason);
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    service.stop();
    refresh.next({ AccessToken: 'new-token' });
    refresh.complete();
    vi.advanceTimersByTime(10000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(service.shouldConnect()).toBe(false);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it.each(['auth reply', '4401'])('ignores failed refresh after stopping during %s', (reason) => {
    const { socket, refresh, dialog } = setup(true);
    failAuth(socket, reason);
    service.stop();
    refresh.error(new Error('Offline'));
    vi.advanceTimersByTime(10000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it.each([
    ['auth reply', 'success'],
    ['auth reply', 'error'],
    ['4401', 'success'],
    ['4401', 'error'],
  ])('ignores old %s refresh %s after restarting', (reason, outcome) => {
    const { socket, refresh } = setup(true);
    failAuth(socket, reason);
    service.stop();
    service.start();
    const current = FakeWebSocket.instances[1];
    current.open();
    current.message({ Success: true });
    if (outcome === 'success') refresh.next({ AccessToken: 'new-token' });
    else refresh.error(new Error('Offline'));
    vi.advanceTimersByTime(10000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(current.close).not.toHaveBeenCalled();
    expect(service.connectionStatus()).toBe('connected');
  });

  it('ignores callbacks retained from a previous socket after restart', () => {
    const { socket, dialog, auth } = setup();
    const stale = { open: socket.onopen!, message: socket.onmessage!, close: socket.onclose!, error: socket.onerror! };
    service.stop();
    service.start();
    const current = FakeWebSocket.instances[1];
    current.open();
    const sends = current.send.mock.calls.length;
    stale.open();
    stale.message({ data: JSON.stringify({ LastEventID: 99 }) });
    stale.close({ code: 4401 });
    stale.error(new Event('error'));
    expect(service.serverState()).toBeNull();
    expect(service.connectionStatus()).toBe('connected');
    expect(current.send).toHaveBeenCalledTimes(sends);
    expect(auth.refreshToken).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('reconnects immediately without leaving a second scheduled connection', () => {
    const { socket } = setup();
    service.subscribe('progress');
    socket.disconnect();
    service.reconnect();
    vi.advanceTimersByTime(10000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    expect(FakeWebSocket.instances[1].send.mock.calls.map(([data]) => JSON.parse(data).Service)).toContain('progress');
  });

  it.each(['auth reply', '4401'])('reconnects after %s refresh when still enabled', (reason) => {
    const { socket, refresh } = setup(true);
    failAuth(socket, reason);
    refresh.next({ AccessToken: 'new-token' });
    refresh.complete();
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].open();
    FakeWebSocket.instances[1].message({ Success: true });
    expect(service.connectionStatus()).toBe('connected');
  });

  it('falls back to timed reconnect when a 4401 refresh fails while enabled', () => {
    const { socket, refresh, dialog } = setup(true);
    socket.disconnect(4401);
    refresh.error(new Error('Offline'));
    expect(dialog.open).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(4999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
