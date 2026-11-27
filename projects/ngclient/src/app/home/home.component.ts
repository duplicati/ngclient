import { PreserveListFocusDirective } from '../core/directives/preserve-list-focus.directive';
import { KeyboardActionDirective } from '../core/directives/keyboard-action.directive';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ShipAlert, ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipChip } from '@ship-ui/core/ship-chip';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipSort, ShipTable } from '@ship-ui/core/ship-table';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { catchError, defer, finalize, map, of, take } from 'rxjs';
import { getBackendIcon, getBackendType } from '../backup/destination/destination.config-utilities';
import { getRunAfterName } from '../backup/schedule-v2/run-after';
import { BackupProgressComponent } from '../core/components/backup-progress/backup-progress.component';
import { PauseDialogComponent } from '../core/components/status-bar/pause-dialog/pause-dialog.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { BackupAndScheduleOutputDto, DuplicatiServer, QueueCompletionAction } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { LastRunErrorPipe, LastRunPipe } from '../core/pipes/last-run.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { ServerStateService } from '../core/services/server-state.service';
import { Backup, BackupsState, OrderBy, TimeType } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';
import { BackupActionsDialog } from './backup-actions-dialog/backup-actions-dialog';
import { StartAllDialog } from './start-all-dialog/start-all-dialog';

@Component({
  selector: 'app-home',
  imports: [
    PreserveListFocusDirective,
    KeyboardActionDirective,
    RouterLink,
    ShipAlert,
    NgTemplateOutlet,
    FormField,
    StatusBarComponent,
    ShipCard,
    ShipButton,
    ShipIcon,
    ShipChip,
    ShipFormField,
    ShipMenu,
    ShipProgressBar,
    ShipButtonGroup,
    ShipTable,
    ShipSort,
    ShipTooltip,
    DurationFormatPipe,
    LastRunPipe,
    LastRunErrorPipe,
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
  #sysinfo = inject(SysinfoState);
  #alertService = inject(ShipAlertService);
  #router = inject(Router);

  hasEnableDisable = this.#sysinfo.hasBackupEnableDisable;

  // The name of the job each job runs after, for the jobs that run after another job
  runAfterNames = computed(() => {
    const backups = this.#backupsState.backups();
    const res: { [key: string]: string } = {};
    if (!this.#sysinfo.hasBackupRunAfter()) return res;

    backups.forEach((bk) => {
      const name = getRunAfterName(backups, bk.Backup?.RunAfterBackupID);
      if (bk.Backup?.ID && name) res[bk.Backup.ID] = name;
    });
    return res;
  });

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  startLabel = $localize`Start`;
  editLabel = $localize`Edit`;
  moreActionsLabel = $localize`More actions`;
  externallyManagedLabel = $localize`Externally managed`;
  stopLabel = $localize`Stop`;
  abortLabel = $localize`Abort`;
  pauseLabel = $localize`Pause`;
  resumeLabel = $localize`Resume`;
  disabledTooltip = $localize`Scheduled runs are skipped while the backup is disabled. You can still start it manually.`;
  sortOrderOptions = this.#backupsState.orderByOptions;
  orderBy = this.#backupsState.orderBy;
  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;
  searchForm = form(signal({ query: '' }));
  searchTerm = this.searchForm.query().value;
  showSearch = computed(() => this.backups().length > 3);
  filteredBackups = computed(() => {
    const backups = this.backups();
    const searchTerm = this.searchTerm().trim().toLowerCase();
    if (!this.showSearch() || !searchTerm) return backups;

    return backups.filter((x) => x.Backup.Name?.toLowerCase().includes(searchTerm));
  });
  startingBackup = this.#backupsState.startingBackup;
  deletingBackup = this.#backupsState.deletingBackup;
  startingAllBackups = this.#backupsState.startingAllBackups;
  runningBackupId = this.#statusBarState.runningBackupId;

  getBackendType = getBackendType;
  getBackendIcon = getBackendIcon;

  timeType = this.#backupsState.timeType;

  clientIsRunning = this.#statusBarState.clientIsRunning;
  isResuming = this.#statusBarState.isResuming;

  // Progress of the running backup as a whole percentage, or null when the phase has no measurable progress
  runningProgress = computed(() => {
    const progress = this.#statusBarState.statusData()?.progress ?? -1;
    return progress < 0 ? null : Math.round(Math.min(progress, 1) * 100);
  });

  // Backup IDs waiting in the scheduler queue (the running one is reported separately)
  queuedBackupIds = computed(() => {
    const running = this.runningBackupId();
    const queue = this.#serverState.serverState()?.SchedulerQueueIds ?? [];
    return new Set(
      queue
        .map((x) => (x.Item2 == null ? null : String(x.Item2)))
        .filter((x): x is string => !!x && x !== String(running))
    );
  });

  // Backups that "Start all" would queue: disabled, running and already queued backups are left out
  startAllBackupIds = computed(() =>
    this.backups()
      .filter((x) => !this.isDisabled(x) && !this.isRunning(x.Backup?.ID) && !this.isQueued(x.Backup?.ID))
      .map((x) => x.Backup?.ID)
      .filter((x): x is string => !!x)
  );

  isRunning(backupId: string | null | undefined) {
    const running = this.runningBackupId();
    return running != null && backupId != null && String(running) === String(backupId);
  }

  isQueued(backupId: string | null | undefined) {
    return backupId != null && this.queuedBackupIds().has(String(backupId));
  }

  // Servers without the feature do not send the flag, so only an explicit false counts as disabled
  isDisabled(backup: BackupAndScheduleOutputDto | null | undefined) {
    return this.hasEnableDisable() && backup?.Backup?.Enabled === false;
  }

  runningTask = computed(() => this.#statusBarState.serverState()?.ActiveTask?.Item1);
  isStopping = computed(() => this.runningTask() == this.#taskStopRequested());
  scheduledTimes = computed(() => {
    const schedule = this.#serverState.serverState()?.ProposedSchedule ?? [];
    const backups = this.#backupsState.backups();

    const res: { [key: string]: string } = {};
    backups.forEach((bk) => {
      const backupId = bk.Backup?.ID;
      if (!backupId) return;
      // A disabled backup is skipped by the scheduler, so it has no next run
      if (this.isDisabled(bk)) return;

      var actual = schedule.find((x) => x.Item1 == backupId);
      if (actual?.Item2) res[backupId] = actual.Item2;
      else if (bk.Schedule?.Time) res[backupId] = bk.Schedule.Time;
    });
    return res;
  });

  #taskStopRequested = signal(-1);

  viewMode = localStorageSignal<'list' | 'details'>('viewMode', 'list');

  sortField = form(signal<OrderBy | null>(this.#backupsState.orderBy()));
  sortByColumn = this.sortField().value;
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

  startAllBackups() {
    const ids = new Set(this.startAllBackupIds());
    if (!ids.size) return;

    // Listed in the order shown on the page, which is also the order they are queued in
    const backups = this.backups()
      .filter((x) => !!x.Backup?.ID && ids.has(x.Backup.ID))
      .map((x) => ({ id: x.Backup!.ID!, name: x.Backup?.Name ?? x.Backup!.ID! }));

    // The server knows if it is allowed to shut down the computer it runs on, so it is asked each
    // time: the answer can change, such as when another user logs in. A server without the feature,
    // or one that does not answer, gets the dialog without the choice.
    if (!this.#sysinfo.hasQueueCompletionAction()) {
      this.#openStartAllDialog(backups, []);
      return;
    }

    if (this.#loadingAfterActions) return;
    this.#loadingAfterActions = true;
    defer(() => this.#dupServer.getApiV1ServerstateQueueCompletionAction())
      .pipe(
        take(1),
        map((res) => res?.SupportedActions ?? []),
        catchError(() => of<QueueCompletionAction[]>([])),
        finalize(() => (this.#loadingAfterActions = false))
      )
      .subscribe((afterActions) => this.#openStartAllDialog(backups, afterActions));
  }

  #loadingAfterActions = false;

  #openStartAllDialog(backups: { id: string; name: string }[], afterActions: QueueCompletionAction[]) {
    this.#dialog.open(StartAllDialog, {
      maxWidth: '500px',
      maxHeight: '80vh',
      width: '100%',
      data: { backups, afterActions },
      closed: (result) => {
        if (!result?.ids.length) return;
        this.#statusBarState.resumeDialogCheck(() =>
          this.#backupsState.startBackups(result.ids, result.afterAction, () =>
            this.#alertService.error(
              result.afterAction === 'Reboot'
                ? $localize`The backups were started, but the computer will not be restarted when they complete.`
                : result.afterAction === 'RunScript'
                  ? $localize`The backups were started, but the script will not be run when they complete.`
                  : $localize`The backups were started, but the computer will not be shut down when they complete.`
            )
          )
        );
      },
    });
  }

  // What the server does to the computer when its queue has run empty
  queueCompletionAction = computed(() => this.#serverState.serverState()?.QueueCompletionAction ?? 'None');
  cancellingQueueCompletionAction = signal(false);

  cancelQueueCompletionAction() {
    if (this.cancellingQueueCompletionAction()) return;
    this.cancellingQueueCompletionAction.set(true);
    defer(() => this.#dupServer.postApiV1ServerstateQueueCompletionAction({ body: { Action: 'None' } }))
      .pipe(
        take(1),
        finalize(() => this.cancellingQueueCompletionAction.set(false))
      )
      .subscribe({
        error: () => this.#alertService.error($localize`Could not cancel. Please try again.`),
      });
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
    defer(() => this.#dupServer.postApiV1TaskByTaskidStop({ path: { taskid: taskId } })).subscribe();
  }

  abort() {
    const taskId = this.runningTask();
    if (!taskId) return;
    defer(() => this.#dupServer.postApiV1TaskByTaskidAbort({ path: { taskid: taskId } })).subscribe();
  }

  getBackupVersionCount(backup: BackupAndScheduleOutputDto | null): number {
    return parseInt(backup?.Backup?.Metadata?.['BackupListCount'] ?? '', 10) || 0;
  }

  openActions(backup: Backup) {
    const id = backup.Backup.ID;
    if (!id) return;

    this.#dialog.open(BackupActionsDialog, {
      maxWidth: '640px',
      maxHeight: '90vh',
      width: '100%',
      data: {
        id,
        name: backup.Backup.Name ?? this.MISSING_BACKUP_NAME,
        isSync: backup.Backup.OperationType === 'Sync',
        isExternal: !!backup.Backup.ExternalID,
        isDisabled: this.isDisabled(backup),
        isScheduled: !!backup.Schedule,
      },
      closed: (action) => {
        if (!action) return;
        if (action.route) this.#router.navigate(action.route);
        else if (action.id === 'verify') this.verifyFiles(id);
        else if (action.id === 'test-restore') this.testRestore(id);
        else if (action.id === 'enable') this.setEnabled(id, true);
        else if (action.id === 'disable') this.setEnabled(id, false);
        else if (action.id === 'skip-next-run') this.skipNextRun(id);
      },
    });
  }

  verifyFiles(id: string) {
    this.loadingId.set(id);
    defer(() => this.#dupServer.postApiV1BackupByIdVerify({ path: { id } }))
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: (res) => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);

          // The request only queues the verification; report its outcome once the task finishes
          if (res?.ID != null) this.#reportVerifyResult(res.ID);
        },
      });
  }

  #reportVerifyResult(taskId: number) {
    this.#serverState
      .waitForTaskToComplete(taskId)
      .pipe(take(1))
      .subscribe((task) => {
        if (task.Status === 'Completed' && task.ErrorMessage == null) {
          this.#alertService.success($localize`Verification of backup files completed successfully.`);
        } else if (task.Status === 'Failed' || task.ErrorMessage != null) {
          const reason = task.ErrorMessage || $localize`Unknown error`;
          this.#alertService.error($localize`Verification of backup files failed: ${reason}`);
        }
      });
  }

  setEnabled(id: string, enabled: boolean) {
    this.loadingId.set(id);
    this.#backupsState
      .setBackupEnabled(id, enabled)
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }

  skipNextRun(id: string) {
    this.loadingId.set(id);
    this.#backupsState
      .skipNextRun(id)
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }

  testRestore(id: string) {
    this.loadingId.set(id);
    defer(() => this.#dupServer.postApiV2BackupRestoreTest({ body: { BackupId: id } }))
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }
}
