import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
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
    Type: 'Warning',
    Title: `Notification ${id}`,
    Message: `Message ${id}`,
    Exception: null,
    BackupID: null,
    Action: null,
    Timestamp: '2026-10-01T00:00:00Z',
    LogEntryID: null,
    MessageID: null,
    MessageLogTag: null,
  };
}

describe('NotificationsState single deletion', () => {
  const requests: Subject<void>[] = [];

  afterEach(() => {
    requests.splice(0).forEach((request) => request.complete());
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup() {
    const original = [11, 22, 33].map(notification);
    const request = new Subject<void>();
    requests.push(request);
    const deleteNotification = vi.fn<(options: { path: { id: number } }) => Subject<void>>(() => request);
    TestBed.configureTestingModule({
      providers: [
        NotificationsState,
        { provide: DuplicatiServer, useValue: { deleteApiV1NotificationById: deleteNotification } },
        { provide: StatusBarState, useValue: { serverState: signal(null) } },
        {
          provide: ServerStateService,
          useValue: { isConnectionMethodSet: signal(false), getConnectionMethod: signal('longpoll') },
        },
        { provide: SysinfoState, useValue: { hasWsRemoteControl: signal(false) } },
        {
          provide: ServerStatusWebSocketService,
          useValue: { subscribe: vi.fn(), notificationState: signal(original) },
        },
      ],
    });
    const state = TestBed.inject(NotificationsState);
    TestBed.tick();
    return { state, original, request, deleteNotification };
  }

  it('removes only the selected notification and sends its ID', () => {
    const { state, request, deleteNotification } = setup();
    state.deleteNotification(1);
    expect(state.notifications()).toEqual([11, 33].map(notification));
    expect(deleteNotification).toHaveBeenCalledExactlyOnceWith({ path: { id: 22 } });
    request.next(undefined);
    request.complete();
    expect(state.notifications()).toEqual([11, 33].map(notification));
    expect(deleteNotification).toHaveBeenCalledTimes(1);
  });

  it('updates computed consumers immediately when deleting a notification', () => {
    const { state } = setup();
    const ids = computed(() => state.notifications().map((notification) => notification.ID));
    expect(ids()).toEqual([11, 22, 33]);
    state.deleteNotification(1);
    expect(ids()).toEqual([11, 33]);
  });

  it('does not mutate the notification array received from WebSocket', () => {
    const { state, original } = setup();
    state.deleteNotification(1);
    expect(original).toEqual([11, 22, 33].map(notification));
    expect(state.notifications()).not.toBe(original);
  });

  it.each([0, 1, 2])('restores the notification at index %s and original order after an API error', (index) => {
    const { state, request } = setup();
    const ids = computed(() => state.notifications().map((notification) => notification.ID));
    expect(ids()).toEqual([11, 22, 33]);
    state.deleteNotification(index);
    expect(state.notifications().map((notification) => notification.ID)).toEqual(
      [11, 22, 33].filter((_, itemIndex) => itemIndex !== index)
    );
    request.error(new Error('Deletion failed'));
    expect(state.notifications()).toEqual([11, 22, 33].map(notification));
    expect(ids()).toEqual([11, 22, 33]);
  });
});
