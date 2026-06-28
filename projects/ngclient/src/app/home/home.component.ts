import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipChip } from '@ship-ui/core/ship-chip';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipDivider } from '@ship-ui/core/ship-divider';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipSort, ShipTable } from '@ship-ui/core/ship-table';
import { finalize } from 'rxjs';
import { getBackendIcon, getBackendType } from '../backup/destination/destination.config-utilities';
import { BackupProgressComponent } from '../core/components/backup-progress/backup-progress.component';
import { PauseDialogComponent } from '../core/components/status-bar/pause-dialog/pause-dialog.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { BackupAndScheduleOutputDto, DuplicatiServer } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { ServerStateService } from '../core/services/server-state.service';
import { Backup, BackupsState, OrderBy, TimeType } from '../core/states/backups.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    StatusBarComponent,
    ShipCard,
    ShipButton,
    ShipIcon,
    ShipChip,
    ShipDivider,
    ShipMenu,
    ShipProgressBar,
    ShipButtonGroup,
    ShipTable,
    ShipSort,
    DurationFormatPipe,
    BytesPipe,
    RelativeTimePipe,
    BackupProgressComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomeComponent {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);
  #backupsState = inject(BackupsState);
  #remoteControlState = inject(RemoteControlState);
  #serverState = inject(ServerStateService);
  #dialog = inject(ShipDialogService);

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  sortOrderOptions = this.#backupsState.orderByOptions;
  orderBy = this.#backupsState.orderBy;
  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;
  startingBackup = this.#backupsState.startingBackup;
  deletingBackup = this.#backupsState.deletingBackup;
  runningBackupId = this.#statusBarState.runningBackupId;

  getBackendType = getBackendType;
  getBackendIcon = getBackendIcon;

  timeType = this.#backupsState.timeType;

  clientIsRunning = this.#statusBarState.clientIsRunning;
  isResuming = this.#statusBarState.isResuming;

  runningTask = computed(() => this.#statusBarState.serverState()?.ActiveTask?.Item1);
  isStopping = computed(() => this.runningTask() == this.#taskStopRequested());
  scheduledTimes = computed(() => {
    const schedule = this.#serverState.serverState()?.ProposedSchedule ?? [];
    const backups = this.#backupsState.backups();

    const res: { [key: string]: string } = {};
    backups.forEach((bk) => {
      const backupId = bk.Backup?.ID;
      if (!backupId) return;

      var actual = schedule.find((x) => x.Item1 == backupId);
      if (actual?.Item2) res[backupId] = actual.Item2;
      else if (bk.Schedule?.Time) res[backupId] = bk.Schedule.Time;
    });
    return res;
  });

  #taskStopRequested = signal(-1);

  viewMode = localStorageSignal<'list' | 'details'>('viewMode', 'list');

  sortByColumn = signal<OrderBy | null>(this.#backupsState.orderBy());
  loadingId = signal<string | null>(null);
  successId = signal<string | null>(null);

  sortEffect = effect(() => this.#backupsState.setOrderBy(this.sortByColumn() as OrderBy));

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  openInConsole(backup: Backup) {
    const externalId = backup.Backup.ExternalID?.split(':')[1];

    if (!externalId) {
      console.error('Backup does not have an external ID');
      return;
    }

    this.#remoteControlState.openConsole('/app/machines/configurations/' + externalId);
  }

  setOrderBy(orderBy: OrderBy) {
    this.#backupsState.setOrderBy(orderBy);
  }

  setTimeType(timeType: TimeType) {
    this.#backupsState.setTimeType(timeType);
  }

  startBackup(id: string) {
    this.#statusBarState.resumeDialogCheck(() => this.#backupsState.startBackup(id));
  }

  openPauseDialog() {
    this.#dialog.open(PauseDialogComponent, {
      maxWidth: '550px',
      width: '100%',
    });
  }

  pauseResume() {
    if (this.clientIsRunning()) {
      this.openPauseDialog();
      return;
    }

    this.#statusBarState.pauseResume().subscribe();
  }

  stop() {
    const taskId = this.runningTask();
    if (!taskId) return;
    this.#taskStopRequested.set(taskId);
    this.#dupServer.postApiV1TaskByTaskidStop({ taskid: taskId }).subscribe();
  }

  abort() {
    const taskId = this.runningTask();
    if (!taskId) return;
    this.#dupServer.postApiV1TaskByTaskidAbort({ taskid: taskId }).subscribe();
  }

  getBackupVersionCount(backup: BackupAndScheduleOutputDto | null): number {
    return parseInt(backup?.Backup?.Metadata?.['BackupListCount'] ?? '', 10) || 0;
  }

  verifyFiles(id: string) {
    this.loadingId.set(id);
    this.#dupServer
      .postApiV1BackupByIdVerify({ id })
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }

  compressBackup(id: string) {
    this.loadingId.set(id);
    this.#dupServer
      .postApiV1BackupByIdCompact({ id })
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }
}
