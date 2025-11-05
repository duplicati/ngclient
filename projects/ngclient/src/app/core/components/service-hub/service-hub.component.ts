import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  WritableSignal,
  computed,
  effect,
  inject,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ShipAlert, ShipAlertItemInternal, ShipAlertService, ShipButton, ShipIcon } from '@ship-ui/core';
import { NotificationComponent } from '../../../notifications/notification/notification.component';
import { NotificationsComponent } from '../../../notifications/notifications.component';
import { NotificationsState } from '../../../notifications/notifications.state';
import { NotificationDto } from '../../openapi';

const fb = new FormBuilder();

type ShipAlertItemCountDown = {
  content: ShipAlertItemInternal;
  countDown: number;
  type: 'alert';
};

type ShipNotificationCountDown = {
  content: NotificationDto;
  countDown: number;
  type: 'notification';
};
type Interval = ReturnType<typeof setInterval>;

@Component({
  selector: 'app-service-hub',
  imports: [
    ReactiveFormsModule,
    ShipAlert,
    ShipIcon,
    ShipButton,
    ShipAlert,
    NotificationsComponent,
    NotificationComponent,
  ],
  templateUrl: './service-hub.component.html',
  styleUrl: './service-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ServiceHubComponent {
  #shipAlertService = inject(ShipAlertService);
  #notificationsState = inject(NotificationsState);

  isSubmitting = signal(false);
  messageSent = signal(false);
  form = fb.group({
    message: fb.control('', [Validators.required]),
  });

  notifications = this.#notificationsState.notifications;
  shownMessage = signal<ShipNotificationCountDown | ShipAlertItemCountDown | null>(null);
  shownMessageInterval: Interval | null = null;
  alertHistory = this.#shipAlertService.alertHistory;
  alertHistoryIsOpen = this.#shipAlertService.alertHistoryIsOpen;
  alertHistoryIsHidden = this.#shipAlertService.alertHistoryIsHidden;
  numberOfOpenAlerts = computed(() => this.alertHistory().filter((x) => x.isOpen).length);
  scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  isAlertsOpen = model<boolean>(false);
  isNotificationsOpen = model<boolean>(false);
  previousHistoryCount = signal<number | null>(null);
  previousNotificationsCount = signal<number | null>(null);

  constructor() {
    effect(() => {
      const history = this.alertHistory();
      const notifications = this.notifications();

      if (notifications.length === 0) {
        this.shownMessage.set(null);
        return;
      }

      if (notifications.length && this.previousHistoryCount() !== history.length && !this.isNotificationsOpen()) {
        this.shownMessage.set({
          content: notifications[0] as NotificationDto,
          countDown: 3,
          type: 'notification',
        });

        this.previousHistoryCount.set(history.length);

        this.shownMessageInterval = setInterval(() => {
          const message = this.shownMessage();

          if (message?.countDown === 0) {
            this.shownMessage.set(null);
            this.shownMessageInterval = null;
            return;
          }

          if (message !== null) {
            (this.shownMessage as WritableSignal<ShipNotificationCountDown>).update((x) => ({
              ...x,
              countDown: x.countDown - 1,
            }));
          }
        }, 1000);
      } else if (history.length && this.previousHistoryCount() !== history.length && !this.isAlertsOpen()) {
        this.shownMessage.set({
          content: history[0],
          countDown: 3,
          type: 'alert',
        });

        this.previousHistoryCount.set(history.length);

        this.shownMessageInterval = setInterval(() => {
          const message = this.shownMessage();

          if (message?.countDown === 0) {
            this.shownMessage.set(null);
            this.shownMessageInterval = null;
            return;
          }

          if (message !== null) {
            (this.shownMessage as WritableSignal<ShipAlertItemCountDown>).update((x) => ({
              ...x,
              countDown: x.countDown - 1,
            }));
          }
        }, 1000);
      }
    });

    effect(() => {
      this.alertHistoryIsOpen();

      this.scrollToBottom();
    });
  }

  resetPreviewMessage() {
    this.shownMessage.set(null);
    this.shownMessageInterval = null;
  }

  toggleAlerts() {
    if (this.isAlertsOpen()) {
      this.isAlertsOpen.set(false);
    } else {
      this.isAlertsOpen.set(true);
      this.isNotificationsOpen.set(false);
      this.resetPreviewMessage();
    }
  }

  toggleNotifications() {
    this.isNotificationsOpen.set(!this.isNotificationsOpen());

    if (this.isAlertsOpen()) {
      this.isAlertsOpen.set(false);
    }
  }

  deleteAlertByIndex(id: string) {
    this.#shipAlertService.removeAlert(id);
  }

  private scrollToBottom() {
    if (this.scroller() && this.scroller()?.nativeElement) {
      this.scroller()!.nativeElement.scrollTo(0, this.scroller()!.nativeElement.scrollHeight);
    }
  }
}
