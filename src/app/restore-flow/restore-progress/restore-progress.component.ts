import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  SparkleCardComponent,
  SparkleIconComponent,
  SparkleProgressBarComponent,
  SparkleSpinnerComponent,
} from '@sparkle-ui/core';
import LogsLiveComponent from '../../about/logs/logs-live/logs-live.component';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { ExtendedNotificationDto, NotificationsComponent } from '../../notifications/notifications.component';
import { RestoreFlowState } from '../restore-flow.state';

@Component({
  selector: 'app-restore-progress',
  imports: [
    LogsLiveComponent,
    SparkleProgressBarComponent,
    SparkleSpinnerComponent,
    SparkleIconComponent,
    SparkleCardComponent,
    NotificationsComponent,
    BytesPipe,
    DecimalPipe,
  ],
  templateUrl: './restore-progress.component.html',
  styleUrl: './restore-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreProgressComponent {
  #statusBarState = inject(StatusBarState);
  #restoreFlowState = inject(RestoreFlowState);

  statusData = this.#statusBarState.statusData;
  backupId = this.#restoreFlowState.backupId;
  taskId = computed(() => this.#statusBarState.statusData()?.TaskID?.toString() ?? undefined);
  lastRestoreStarted = computed(() => {
    const lastRestoreStarted =
      this.#statusBarState.statusData()?.backup?.Backup?.Metadata?.['LastRestoreStarted'] ?? null;

    if (!lastRestoreStarted) return null;

    return this.fixDate(lastRestoreStarted);
  });

  notificationFilterPredicate = () => {
    const lastRestoreStarted = this.lastRestoreStarted();

    return {
      predicate: (x: ExtendedNotificationDto) => {
        return (
          (x.BackupID === this.#restoreFlowState.backupId() &&
            lastRestoreStarted &&
            lastRestoreStarted.getTime() <= new Date(x.Timestamp!).getTime()) ??
          false
        );
      },
    };
  };

  ngOnInit() {
    this.#statusBarState.fetchProgressState();
    this.#statusBarState.startPollingProgress();
  }

  fixDate(date: string) {
    return new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(
        9,
        11
      )}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`
    );
  }
}
