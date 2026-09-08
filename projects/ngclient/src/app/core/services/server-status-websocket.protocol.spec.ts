import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../openapi/client.gen';
import { AppAuthState } from '../states/app-auth.state';
import { SysinfoState } from '../states/sysinfo.state';
import { ServerStatusWebSocketService } from './server-status-websocket.service';

class ProtocolSocket {
  static OPEN = 1;
  static instances: ProtocolSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn<(data: string) => void>();
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  });

  constructor(readonly url: string) {
    ProtocolSocket.instances.push(this);
  }

  open() {
    this.readyState = ProtocolSocket.OPEN;
    this.onopen?.();
  }

  receive(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  sent() {
    return this.send.mock.calls.map(([data]) => JSON.parse(data));
  }
}

describe('ServerStatusWebSocketService protocol', () => {
  let service: ServerStatusWebSocketService;
  let originalBaseUrl: ReturnType<typeof client.getConfig>['baseUrl'];

  beforeEach(() => {
    vi.useFakeTimers();
    ProtocolSocket.instances = [];
    vi.stubGlobal('WebSocket', ProtocolSocket);
    originalBaseUrl = client.getConfig().baseUrl;
    client.setConfig({ baseUrl: '' });
  });

  afterEach(() => {
    service?.stop();
    client.setConfig({ baseUrl: originalBaseUrl });
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const setup = (modernAuth = false, xsrf: string | null = null) => {
    TestBed.configureTestingModule({
      providers: [
        ServerStatusWebSocketService,
        { provide: AppAuthState, useValue: { token: signal('access-token'), xsrfQueryParam: signal(xsrf) } },
        { provide: SysinfoState, useValue: { hasWebSocketAuth: () => modernAuth } },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
      ],
    });
    service = TestBed.inject(ServerStatusWebSocketService);
    return service;
  };

  const connect = () => {
    service.start();
    const socket = ProtocolSocket.instances.at(-1)!;
    socket.open();
    return socket;
  };

  it('authenticates legacy connections through the URL and sends queued subscriptions on open', () => {
    setup();
    service.subscribe('progress', { backupId: '7' });
    service.start();
    const socket = ProtocolSocket.instances[0];
    expect(new URL(socket.url).searchParams.get('token')).toBe('access-token');
    expect(socket.send).not.toHaveBeenCalled();
    socket.open();
    expect(service.connectionStatus()).toBe('connected');
    expect(socket.sent()).toEqual([
      expect.objectContaining({ Version: 1, Action: 'sub', Service: 'legacystatus' }),
      expect.objectContaining({ Version: 1, Action: 'sub', Service: 'progress', Data: { backupId: '7' } }),
    ]);
  });

  it('waits for modern authentication before sending queued subscriptions', () => {
    setup(true);
    service.subscribe('progress', { backupId: '7' });
    const socket = connect();
    expect(new URL(socket.url).searchParams.has('token')).toBe(false);
    expect(service.connectionStatus()).toBe('authenticating');
    expect(socket.sent()).toEqual([{ Version: 1, Token: 'access-token', Action: 'auth' }]);
    socket.receive({ Version: 1, Success: true, Message: 'OK' });
    expect(service.connectionStatus()).toBe('connected');
    expect(socket.sent().slice(1)).toEqual([
      expect.objectContaining({ Action: 'sub', Service: 'legacystatus' }),
      expect.objectContaining({ Action: 'sub', Service: 'progress', Data: { backupId: '7' } }),
    ]);
  });

  it.each([false, true])('preserves proxy prefix and XSRF query with modern auth=%s', (modernAuth) => {
    client.setConfig({ baseUrl: '/duplicati' });
    setup(modernAuth, 'xsrf-token=proxy-value');
    service.start();
    const url = new URL(ProtocolSocket.instances[0].url);
    expect(url.pathname).toBe('/duplicati/notifications');
    expect(url.searchParams.get('xsrf-token')).toBe('proxy-value');
    expect(url.searchParams.get('token')).toBe(modernAuth ? null : 'access-token');
  });

  it('accepts pre-authenticated legacy status and processes that first update', () => {
    setup(true);
    const socket = connect();
    const status = { Type: 'legacystatus', LastEventID: 17 };
    socket.receive(status);
    expect(service.connectionStatus()).toBe('connected');
    expect(service.serverState()).toEqual(status);
    expect(socket.sent().slice(1)).toEqual([expect.objectContaining({ Action: 'sub', Service: 'legacystatus' })]);
  });

  it('sends changed subscriptions once and assigns unique request IDs', () => {
    setup();
    const socket = connect();
    service.subscribe('progress', { backupId: '1' });
    service.subscribe('progress', { backupId: '1' });
    service.subscribe('progress', { backupId: '2' });
    service.subscribe('taskcompleted');
    service.subscribe('taskcompleted');
    expect(socket.sent().filter((request) => request.Service === 'progress')).toEqual([
      expect.objectContaining({ Action: 'sub', Data: { backupId: '1' } }),
      expect.objectContaining({ Action: 'sub', Data: { backupId: '2' } }),
    ]);
    expect(socket.sent().filter((request) => request.Service === 'taskcompleted')).toHaveLength(1);
    const ids = socket.sent().map((request) => request.Id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('unsubscribes once and only resends retained subscriptions after reconnect', () => {
    setup();
    const socket = connect();
    service.subscribe('progress', { backupId: '1' });
    service.subscribe('notifications');
    service.unsubscribe('progress');
    service.unsubscribe('progress');
    expect(socket.sent().filter((request) => request.Action === 'unsub')).toEqual([
      expect.objectContaining({ Version: 1, Action: 'unsub', Service: 'progress' }),
    ]);
    service.reconnect();
    const next = ProtocolSocket.instances[1];
    next.open();
    expect(next.sent().map((request) => request.Service)).toEqual(['legacystatus', 'notifications']);
    expect(service.subscriptions()).not.toHaveProperty('progress');
  });

  it.each([
    ['progress', 'serverProgress', { Phase: 'Backup_ProcessingFiles', OverallProgress: 0.5 }],
    ['serversettings', 'serverSettings', { 'server-listen-interface': 'loopback' }],
    ['taskqueue', 'serverTaskQueue', [{ ID: 7 }]],
    ['backuplist', 'backupListState', [{ Backup: { ID: '7', Name: 'Test backup' } }]],
    ['notifications', 'notificationState', [{ ID: 3, Message: 'Test notification' }]],
    ['remotecontrol', 'remoteControlState', { IsEnabled: true }],
  ] as const)('routes %s data to %s', (type, state, data) => {
    setup();
    const socket = connect();
    expect(service[state]()).toBeNull();
    socket.receive({ Type: type, ApiVersion: 1, Data: data });
    expect(service[state]()).toEqual(data);
    expect(service.serverState()).toBeNull();
  });

  it('delivers task completion events to the task subscriber', () => {
    setup();
    const next = vi.fn();
    const subscription = service.taskCompleted.subscribe(next);
    const socket = connect();
    const task = { ID: 7, TaskFinished: '2026-09-05T00:00:00Z' };
    socket.receive({ Type: 'taskcompleted', ApiVersion: 1, Data: task });
    expect(next).toHaveBeenCalledExactlyOnceWith(task);
    subscription.unsubscribe();
  });

  it.each([{ LastEventID: 11 }, { Type: 'legacystatus', LastEventID: 12 }])(
    'retains the full legacy status message %j',
    (status) => {
      setup();
      const socket = connect();
      socket.receive(status);
      expect(service.serverState()).toEqual(status);
    }
  );

  it.each(['unknown', 'invalid JSON', 'failed reply'])('continues processing after %s', (kind) => {
    setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const socket = connect();
    const status = { LastEventID: 10 };
    socket.receive(status);
    if (kind === 'unknown') socket.receive({ Type: 'future-event', Data: {} });
    else if (kind === 'invalid JSON') socket.onmessage?.({ data: '{invalid' });
    else socket.receive({ Type: 'reply', Success: false, Message: 'Subscription rejected' });
    expect(kind === 'unknown' ? warn : error).toHaveBeenCalledTimes(1);
    expect(service.serverState()).toEqual(status);
    expect(service.connectionStatus()).toBe('connected');
    socket.receive({ Type: 'progress', ApiVersion: 1, Data: { OverallProgress: 0.75 } });
    expect(service.serverProgress()).toEqual({ OverallProgress: 0.75 });
  });
});
