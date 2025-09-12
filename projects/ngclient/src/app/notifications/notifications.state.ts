import { effect, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, forkJoin, of, take, tap } from 'rxjs';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { DuplicatiServer, NotificationDto } from '../core/openapi';

@Injectable({
  providedIn: 'root',
})
export class NotificationsState {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);

  serverState = this.#statusBarState.serverState;

  serverStateEffect = effect(() => {
    const serverState = this.#statusBarState.serverState();

    if (serverState?.LastNotificationUpdateID) {
      this.updateLastNotificationEventId(serverState?.LastNotificationUpdateID);
    }
  });

  #lastNotificationEventId = -1;
  #isloadingNotifications = signal(false);
  #notificationStream = signal<NotificationDto[]>([]);
  #tempStream = signal<NotificationDto[]>([]);

  notifications = this.#notificationStream.asReadonly();

  init() {
    if (this.notifications().length === 0) {
      this.getNotifications();
    }
  }

  updateLastNotificationEventId(eventId: number) {
    const currentEventId = this.#lastNotificationEventId;

    if (currentEventId === eventId) return;

    this.#lastNotificationEventId = eventId;
    this.getNotifications();
  }

  getNotifications() {
    this.#isloadingNotifications.set(true);

    this.#dupServer
      .getApiV1Notifications()
      .pipe(
        take(1),
        tap((notifications) => this.#notificationStream.set(notifications)),
        finalize(() => this.#isloadingNotifications.set(false))
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
