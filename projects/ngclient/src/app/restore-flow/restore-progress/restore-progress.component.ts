import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ShipCard, ShipIcon, ShipProgressBar, ShipSpinner } from '@ship-ui/core';
import LogsLiveComponent from '../../about/logs/logs-live/logs-live.component';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { DuplicatiServer, GetTaskStateDto } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { ServerStateService } from '../../core/services/server-state.service';
import { ExtendedNotificationDto, NotificationsComponent } from '../../notifications/notifications.component';
import { RestoreFlowState } from '../restore-flow.state';

@Component({
  selector: 'app-restore-progress',
  imports: [
    LogsLiveComponent,
    ShipProgressBar,
    ShipSpinner,
    ShipIcon,
    ShipCard,
    NotificationsComponent,
    BytesPipe,
    DecimalPipe,
  ],
  templateUrl: './restore-progress.component.html',
  styleUrl: './restore-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreProgressComponent implements OnInit {
  #dupServer = inject(DuplicatiServer);
  #serverState = inject(ServerStateService);
  #statusBarState = inject(StatusBarState);
  #restoreFlowState = inject(RestoreFlowState);
  #route = inject(ActivatedRoute);

  statusData = this.#statusBarState.statusData;
  backupId = this.#restoreFlowState.backupId;
  restoreResult = signal<'' | 'success' | 'error'>('');
  #taskStarted: Date | null = null;
  lastRestoreStarted = computed(() => {
    if (this.#taskStarted) return this.#taskStarted;

    const lastRestoreStarted =
      this.#statusBarState.statusData()?.backup?.Backup?.Metadata?.['LastRestoreStarted'] ?? null;

    if (!lastRestoreStarted) return null;

    const lastRestoreStartedDate = this.fixDate(lastRestoreStarted);
    this.#taskStarted = lastRestoreStartedDate;
    return lastRestoreStartedDate;
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
    const taskid = this.#route.snapshot.params['taskid']?.toString() ?? '';
    this.#dupServer.getApiV1TaskByTaskid({ taskid }).subscribe({
      next: (res) => {
        if (res.TaskStarted) this.#taskStarted = new Date(res.TaskStarted);
        if (!res.TaskFinished && res.ID) {
          this.#waitForTaskToComplete(res.ID);
          return;
        }
        this.#setTaskResult(res);
      },
      error: (err) => {
        console.error('Error fetching task:', err);
        this.restoreResult.set('error');
        alert('Failed to fetch task details. Please try again later.');
      },
    });
  }

  #waitForTaskToComplete(taskId: number) {
    this.#serverState.waitForTaskToComplete(taskId).subscribe((res) => {
      this.#setTaskResult(res);
    });
  }

  #setTaskResult(task: GetTaskStateDto) {
    if (task.TaskFinished != null) {
      this.restoreResult.set(task.Status === 'Completed' && task.ErrorMessage == null ? 'success' : 'error');
    }
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
