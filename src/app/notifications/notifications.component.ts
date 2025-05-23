import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core';
import { NotificationDto } from '../core/openapi';
import { NotificationComponent } from './notification/notification.component';
import { NotificationsState } from './notifications.state';

export type ExtendedNotificationDto = NotificationDto & {
  DownloadLink?: string;
};

@Component({
  selector: 'app-notifications',
  imports: [NotificationComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  #notificationState = inject(NotificationsState);

  notificationFilterPredicate = input<{ predicate: (x: ExtendedNotificationDto) => boolean }>();

  notifications = computed(() => {
    const predicate = this.notificationFilterPredicate()?.predicate;

    const notifications = (this.#notificationState.notifications as Signal<ExtendedNotificationDto[]>)();

    if (typeof predicate !== 'function') return notifications;

    return notifications.filter(predicate);
  });
}
