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
import {
  SparkleAlertComponent,
  SparkleAlertItemInternal,
  SparkleAlertService,
  SparkleButtonComponent,
  SparkleIconComponent,
} from '@sparkle-ui/core';
import { NotificationsComponent } from '../../../notifications/notifications.component';
import { NotificationsState } from '../../../notifications/notifications.state';

const fb = new FormBuilder();

type SparkleAlertItemCountDown = SparkleAlertItemInternal & {
  countDown: number;
};
type Interval = ReturnType<typeof setInterval>;

@Component({
  selector: 'app-service-hub',
  imports: [
    ReactiveFormsModule,
    SparkleAlertComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleAlertComponent,
    NotificationsComponent,
  ],
  templateUrl: './service-hub.component.html',
  styleUrl: './service-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ServiceHubComponent {
  #sparkleAlertService = inject(SparkleAlertService);
  #notificationsState = inject(NotificationsState);

  isSubmitting = signal(false);
  messageSent = signal(false);
  form = fb.group({
    message: fb.control('', [Validators.required]),
  });

  notifications = this.#notificationsState.notifications;
  shownMessage = signal<SparkleAlertItemCountDown | null>(null);
  shownMessageInterval: Interval | null = null;
  alertHistory = this.#sparkleAlertService.alertHistory;
  alertHistoryIsOpen = this.#sparkleAlertService.alertHistoryIsOpen;
  alertHistoryIsHidden = this.#sparkleAlertService.alertHistoryIsHidden;
  numberOfOpenAlerts = computed(() => this.alertHistory().filter((x) => x.isOpen).length);
  scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  isAlertsOpen = model<boolean>(false);
  isNotificationsOpen = model<boolean>(false);
  previousHistoryCount = signal<number | null>(null);

  constructor() {
    effect(() => {
      const history = this.alertHistory();

      if (history.length && this.previousHistoryCount() !== history.length && !this.isAlertsOpen()) {
        this.shownMessage.set({
          ...history[0],
          countDown: 3,
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
            (this.shownMessage as WritableSignal<SparkleAlertItemCountDown>).update((x) => ({
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

  private scrollToBottom() {
    if (this.scroller() && this.scroller()?.nativeElement) {
      this.scroller()!.nativeElement.scrollTo(0, this.scroller()!.nativeElement.scrollHeight);
    }
  }
}
