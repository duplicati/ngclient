import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ShipAlert,
  ShipAlertService,
  ShipAlertType,
  ShipButton,
  ShipDialogService,
  ShipProgressBar,
} from '@ship-ui/core';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, NotificationType } from '../../core/openapi';
import { OpenAPI } from '../../core/openapi/core/OpenAPI';
import { ExtendedNotificationDto } from '../notifications.component';
import { NotificationsState } from '../notifications.state';

const NOTIFICATION_TYPE_MAP: Record<string, ShipAlertType> = {
  Error: 'error',
  Warning: 'warn',
  Information: 'primary',
};

@Component({
  selector: 'app-notification',
  imports: [ShipProgressBar, ShipButton, ShipAlert],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationComponent {
  #router = inject(Router);
  #activatedRoute = inject(ActivatedRoute);
  #dialog = inject(ShipDialogService);
  #snackbar = inject(ShipAlertService);
  #notificationState = inject(NotificationsState);
  #dupServer = inject(DuplicatiServer);
  #generatedDownloadLink = signal<string | null>(null);

  serverState = this.#notificationState.serverState;

  index = input.required<number>();
  notification = input.required<ExtendedNotificationDto>();

  downloadLink = computed(() => {
    return this.#generatedDownloadLink() || this.notification().DownloadLink || '';
  });

  deleteNotificationByIndex() {
    this.#notificationState.deleteNotification(this.index());
  }

  deleteAllNotifications() {
    this.#notificationState.deleteAllNotifications();
  }

  getAlertType(type?: NotificationType): ShipAlertType {
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
        operation: `bugreport`,
      })
      .subscribe({
        next: (res) => {
          if (!res.Token) {
            this.#snackbar.error(`Failed to get bug report URL: No token generated`);
            return;
          }

          const prefix = OpenAPI.BASE || '';
          const link = `${location.origin}${prefix}/api/v1/bugreport/${id}?token=${res.Token}`;

          item.DownloadLink = link;
          this.#generatedDownloadLink.set(link);

          this.triggerDownload(link);
        },
        error: (err) => {
          this.#snackbar.error(`Failed to get bug report URL: ${err.message}`);
        },
      });
  }

  triggerDownload(link: string) {
    const a = document.createElement('a');
    a.href = link;
    a.download = '';
    a.style.display = 'none';
    document.body.appendChild(a);
    try {
      a.click();
    } catch {}
    document.body.removeChild(a);
  }
}
