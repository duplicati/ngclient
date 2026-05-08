import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, of, take, tap } from 'rxjs';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { DuplicatiServer, NotificationDto } from '../core/openapi';
import { ServerStateService } from '../core/services/server-state.service';
import { ServerStatusWebSocketService } from '../core/services/server-status-websocket.service';
import { SysinfoState } from '../core/states/sysinfo.state';

@Injectable({
  providedIn: 'root',
})
export class NotificationsState {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);
  #serverState = inject(ServerStateService);
  #sysinfo = inject(SysinfoState);
  #wsService = inject(ServerStatusWebSocketService);

  serverState = this.#statusBarState.serverState;

  serverStateEffect = effect(() => {
    const serverState = this.#statusBarState.serverState();

    if (serverState?.LastNotificationUpdateID) {
      this.updateLastNotificationEventId(serverState?.LastNotificationUpdateID);
    }
  });

  #lastNotificationEventId = -1;
  #notificationStream = signal<NotificationDto[]>([]);
  #tempStream = signal<NotificationDto[]>([]);

  notifications = this.#notificationStream.asReadonly();
  pendingRefresh = false;

  constructor() {
    this.#wsService.subscribe('notifications');
  }

  init() {
    if (this.notifications().length === 0) {
      this.getNotifications();
    }
  }

  notificationsEffect = effect(() => {
    const notifications = this.#wsService.notificationState();
    if (!notifications) return;

    this.#notificationStream.set(notifications);
  });

  pendingRefreshEffect = effect(() => {
    const isSet = this.#serverState.isConnectionMethodSet();
    if (!isSet) return;

    if (this.pendingRefresh) {
      this.pendingRefresh = false;
      this.getNotifications();
    }
  });

  #usingWebsocket = computed(() => {
    const isUsingWs = this.#serverState.getConnectionMethod() === 'websocket';
    const hasWsRemote = this.#sysinfo.hasWsRemoteControl();
    return isUsingWs && hasWsRemote;
  });

  updateLastNotificationEventId(eventId: number) {
    const currentEventId = this.#lastNotificationEventId;

    if (currentEventId === eventId) return;

    this.#lastNotificationEventId = eventId;
    this.getNotifications();
  }

  getNotifications() {
    if (this.#usingWebsocket()) return;
    if (!this.#serverState.isConnectionMethodSet()) {
      this.pendingRefresh = true;
      return;
    }

    this.#dupServer
      .getApiV1Notifications()
      .pipe(
        take(1),
        tap((notifications) => this.#notificationStream.set(notifications))
      )
      .subscribe();
  }

  getNofication(notificationId: number) {
    this.#dupServer
      .getApiV1NotificationById({
        id: notificationId,
      })
      .pipe(take(1))
      .subscribe();
  }

  deleteNotification(notificationIndex: number) {
    const notifications = this.#notificationStream();
    const notification = notifications[notificationIndex];

    this.#tempStream.set(notifications);
    notifications.splice(notificationIndex, 1);

    this.#notificationStream.set(notifications);

    this.#dupServer
      .deleteApiV1NotificationById({
        id: notification.ID!,
      })
      .pipe(take(1))
      .subscribe({
        error: () => {
          this.#notificationStream.set(this.#tempStream());
          this.#tempStream.set([]);
        },
      });
  }

  deleteAllNotifications() {
    const notifications = this.#notificationStream();

    this.#tempStream.set(notifications);
    this.#notificationStream.set([]);

    const deletionObservables = notifications.map((notification) =>
      this.#dupServer.deleteApiV1NotificationById({ id: notification.ID! }).pipe(catchError(() => of(notification)))
    );

    forkJoin(deletionObservables)
      .pipe(take(1))
      .subscribe({
        next: (results) => {
          const remainingNotifications = (results as (NotificationDto | undefined | null)[]).filter(
            (result) => result !== undefined && result !== null && 'ID' in result
          ) as NotificationDto[];

          this.#notificationStream.set(remainingNotifications);
          this.#tempStream.set([]);
        },
        error: () => {
          // Restore original notifications if something goes wrong
          this.#notificationStream.set(this.#tempStream());
          this.#tempStream.set([]);
        },
      });
  }
}
