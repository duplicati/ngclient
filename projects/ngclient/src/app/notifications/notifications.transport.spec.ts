import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { DuplicatiServer, NotificationDto } from '../core/openapi';
import { ServerStateService } from '../core/services/server-state.service';
import { ServerStatusWebSocketService } from '../core/services/server-status-websocket.service';
import { SysinfoState } from '../core/states/sysinfo.state';
import { NotificationsState } from './notifications.state';

function notification(id: number): NotificationDto {
  return {
    ID: id,
    Type: 'Information',
    Title: `Notification ${id}`,
    Message: `Message ${id}`,
    Exception: null,
    BackupID: null,
    Action: null,
    Timestamp: '2026-10-02T00:00:00Z',
    LogEntryID: null,
    MessageID: null,
    MessageLogTag: null,
  };
}

describe('NotificationsState notification transport', () => {
  const requests: Subject<NotificationDto[]>[] = [];

  async function flush() {
    await Promise.resolve();
    TestBed.tick();
  }

  afterEach(async () => {
    requests.splice(0).forEach((request) => {
      request.next([]);
      request.complete();
    });
    await flush();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup(
    options: {
      connectionSet?: boolean;
      method?: 'longpoll' | 'websocket';
      supportsNotifications?: boolean;
      initialNotifications?: NotificationDto[];
    } = {}
  ) {
    const connectionSet = signal(options.connectionSet ?? true);
    const method = signal(options.method ?? 'longpoll');
    const status = signal<{ LastNotificationUpdateID: number } | null>(null);
    const incoming = signal<NotificationDto[] | null>(options.initialNotifications ?? null);
    const subscribe = vi.fn();
    const getNotifications = vi.fn<() => Promise<NotificationDto[]>>(() => {
      const request = new Subject<NotificationDto[]>();
      requests.push(request);
      return firstValueFrom(request);
    });
    TestBed.configureTestingModule({
      providers: [
        NotificationsState,
        { provide: DuplicatiServer, useValue: { getApiV1Notifications: getNotifications } },
        { provide: StatusBarState, useValue: { serverState: status } },
        {
          provide: ServerStateService,
          useValue: { isConnectionMethodSet: connectionSet, getConnectionMethod: method },
        },
        { provide: SysinfoState, useValue: { hasWsRemoteControl: signal(options.supportsNotifications ?? false) } },
        { provide: ServerStatusWebSocketService, useValue: { subscribe, notificationState: incoming } },
      ],
    });
    const state = TestBed.inject(NotificationsState);
    TestBed.tick();
    return { state, getNotifications, subscribe, connectionSet, status, incoming };
  }

  it('registers for WebSocket notifications without eagerly fetching over HTTP', () => {
    const { state, subscribe, getNotifications } = setup();
    expect(subscribe).toHaveBeenCalledExactlyOnceWith('notifications');
    expect(getNotifications).not.toHaveBeenCalled();
    expect(state.notifications()).toEqual([]);
  });

  it.each([
    { label: 'empty list', response: [] },
    { label: 'ordered notifications', response: [notification(22), notification(11)] },
  ])('fetches an empty initial list and applies $label', async ({ response }) => {
    const { state, getNotifications } = setup();
    state.init();
    expect(getNotifications).toHaveBeenCalledExactlyOnceWith();
    expect(state.notifications()).toEqual([]);
    requests[0].next(response);
    await flush();
    expect(state.notifications()).toEqual(response);
  });

  it('does not fetch on init when notifications are already available', () => {
    const existing = [notification(11)];
    const { state, getNotifications } = setup({ initialNotifications: existing });
    state.init();
    expect(state.notifications()).toEqual(existing);
    expect(getNotifications).not.toHaveBeenCalled();
  });

  it('defers refresh until the connection method is set and consumes the pending refresh once', async () => {
    const { state, connectionSet, getNotifications } = setup({ connectionSet: false });
    state.getNotifications();
    state.getNotifications();
    expect(state.pendingRefresh).toBe(true);
    expect(getNotifications).not.toHaveBeenCalled();
    connectionSet.set(true);
    TestBed.tick();
    expect(state.pendingRefresh).toBe(false);
    expect(getNotifications).toHaveBeenCalledTimes(1);
    const response = [notification(11)];
    requests[0].next(response);
    await flush();
    TestBed.tick();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    expect(state.notifications()).toEqual(response);
  });

  it('fetches for new notification event IDs but not a repeated ID', async () => {
    const { state, getNotifications } = setup();
    state.updateLastNotificationEventId(10);
    state.updateLastNotificationEventId(10);
    expect(getNotifications).toHaveBeenCalledTimes(1);
    requests[0].next([notification(11)]);
    await flush();
    state.updateLastNotificationEventId(11);
    expect(getNotifications).toHaveBeenCalledTimes(2);
    const latest = [notification(22)];
    requests[1].next(latest);
    await flush();
    expect(state.notifications()).toEqual(latest);
  });

  it('observes LastNotificationUpdateID changes in server status', () => {
    const { status, getNotifications } = setup();
    status.set({ LastNotificationUpdateID: 10 });
    TestBed.tick();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    status.set({ LastNotificationUpdateID: 10 });
    TestBed.tick();
    expect(getNotifications).toHaveBeenCalledTimes(1);
    status.set({ LastNotificationUpdateID: 11 });
    TestBed.tick();
    expect(getNotifications).toHaveBeenCalledTimes(2);
  });

  it('uses WebSocket notification updates including an empty list without fetching over HTTP', () => {
    const { state, incoming, getNotifications } = setup({ method: 'websocket', supportsNotifications: true });
    state.init();
    state.getNotifications();
    state.updateLastNotificationEventId(10);
    expect(getNotifications).not.toHaveBeenCalled();
    const response = [notification(22), notification(11)];
    incoming.set(response);
    TestBed.tick();
    expect(state.notifications()).toEqual(response);
    incoming.set([]);
    TestBed.tick();
    expect(state.notifications()).toEqual([]);
    expect(getNotifications).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'longpoll', supportsNotifications: true },
    { method: 'websocket', supportsNotifications: false },
  ] as const)('fetches over HTTP for $method with notification support=$supportsNotifications', async (options) => {
    const { state, getNotifications } = setup(options);
    state.getNotifications();
    expect(getNotifications).toHaveBeenCalledExactlyOnceWith();
    const response = [notification(11)];
    requests[0].next(response);
    await flush();
    expect(state.notifications()).toEqual(response);
  });

  it('does not erase existing notifications when the WebSocket signal is unavailable', () => {
    const existing = [notification(11)];
    const { state, incoming } = setup({ initialNotifications: existing });
    incoming.set(null);
    TestBed.tick();
    expect(state.notifications()).toEqual(existing);
  });
});
