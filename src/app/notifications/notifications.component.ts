import { ChangeDetectionStrategy, Component, inject, Signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleAlertComponent,
  SparkleAlertService,
  SparkleAlertType,
  SparkleDialogService,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServerService, NotificationDto, NotificationType } from '../core/openapi';
import { NotificationsState } from './notifications.state';

const NOTIFICATION_TYPE_MAP: Record<string, SparkleAlertType> = {
  Error: 'error',
  Warning: 'warning',
  Information: 'primary',
};

type ExtendedNotificationDto = NotificationDto & {
  DownloadLink?: string;
};

@Component({
  selector: 'app-notifications',
  imports: [SparkleAlertComponent, SparkleProgressBarComponent],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  #router = inject(Router);
  #activatedRoute = inject(ActivatedRoute);
  #dialog = inject(SparkleDialogService);
  #snackbar = inject(SparkleAlertService);
  #dupServer = inject(DuplicatiServerService);
  #notificationState = inject(NotificationsState);

  notifications = this.#notificationState.notifications as Signal<ExtendedNotificationDto[]>;
  serverState = this.#notificationState.serverState;

  deleteNotificationByIndex(index: number) {
    this.#notificationState.deleteNotification(index);
  }

  deleteAllNotifications() {
    this.#notificationState.deleteAllNotifications();
  }

  getAlertType(type?: NotificationType): SparkleAlertType {
    return type ? NOTIFICATION_TYPE_MAP[type] || 'primary' : 'primary';
  }

  doShowLog(backupId: string) {
    this.#dupServer.getApiV1BackupByIdIsactive({ id: backupId }).subscribe({
      next: (res) => {
        this.#router.navigate(['/backup/' + backupId + '/log']);
      },
      error: (err) => {
        if (err.status === 404) {
          let data = {
            title: $localize`Error`,
            message: $localize`The backup is missing, has it been deleted?`,
            confirmText: $localize`OK`,
            cancelText: null,
          };
          if (parseInt(backupId) + '' != backupId) {
            data = {
              title: $localize`Error`,
              message: $localize`The backup was temporary and does not exist anymore, so the log data is lost`,
              confirmText: $localize`OK`,
              cancelText: null,
            };
          }

          this.#dialog.open(ConfirmDialogComponent, {
            maxWidth: '550px',
            width: '100%',
            data,
          });
        } else {
          this.#snackbar.error($localize`Failed to find backup: ` + err.message);
        }
      },
    });
  }

  doRepair(backupId: string) {
    this.#dupServer.postApiV1BackupByIdRepair({ id: backupId }).subscribe({
      next: () => {
        this.#snackbar.success($localize`Backup repaired`);
        this.#router.navigate(['./'], {
          onSameUrlNavigation: 'reload',
          relativeTo: this.#activatedRoute,
        });
      },
      error: (err) => {
        this.#snackbar.error($localize`Failed to repair backup: ` + err.message);
      },
    });
  }

  doShowUpdate() {
    this.#router.navigate(['/about/changelog']);
  }

  doShowLink(link: string) {
    window.open(link, '_blank');
  }

  doDownloadBugreport(item: ExtendedNotificationDto) {
    const id = item.Action!.slice('bug-report:created:'.length);

    this.#dupServer
      .postApiV1AuthIssuetokenByOperation({
        operation: `bugreport/${id}`,
      })
      .subscribe({
        next: (res) => {
          if (!res.Token) {
            this.#snackbar.error(`Failed to get bug report URL: No token generated`);
            return;
          }

          item.DownloadLink = res.Token;
        },
        error: (err) => {
          this.#snackbar.error(`Failed to get bug report URL: ${err.message}`);
        },
      });
  }
}
