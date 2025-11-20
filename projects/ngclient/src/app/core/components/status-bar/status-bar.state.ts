import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ShipDialogService } from '@ship-ui/core';
import { finalize, map, of, switchMap } from 'rxjs';
import {
  DuplicatiServer,
  GetApiV1ProgressstateResponse,
  GetApiV1TaskByTaskidResponse,
  ServerStatusDto,
} from '../../openapi';
import { BytesPipe } from '../../pipes/byte.pipe';
import { ServerStateService } from '../../services/server-state.service';
import { Backup, BackupsState } from '../../states/backups.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
type Task = GetApiV1TaskByTaskidResponse;

export type Status = GetApiV1ProgressstateResponse & {
  task?: Task | null;
  backup?: Backup | null;
};

export type StatusWithContent = Status & {
  progress: number;
  statusText: string;
  actionText: string;
};

const STATUS_STATES: Record<string, string> = {
  Starting_Operation: $localize`Starting operation …`,
  Backup_Begin: $localize`Starting backup …`,
  Backup_PreBackupVerify: $localize`Verifying backend data …`,
  Backup_PostBackupTest: $localize`Verifying remote data …`,
  Backup_PreviousBackupFinalize: $localize`Completing previous backup …`,
  Backup_ProcessingFiles: $localize`Processing files to backup …`,
  Backup_Finalize: $localize`Completing backup …`,
  Backup_WaitForUpload: $localize`Waiting for upload to finish …`,
  Backup_Delete: $localize`Deleting unwanted files …`,
  Backup_Compact: $localize`Compacting remote data …`,
  Backup_VerificationUpload: $localize`Uploading verification file …`,
  Backup_PostBackupVerify: $localize`Verifying backend data …`,
  Backup_Complete: $localize`Backup complete!`,
  Restore_Begin: $localize`Starting restore …`,
  Restore_RecreateDatabase: $localize`Rebuilding local database …`,
  Restore_PreRestoreVerify: $localize`Verifying remote data …`,
  Restore_CreateFileList: $localize`Building list of files to restore …`,
  Restore_CreateTargetFolders: $localize`Creating target folders …`,
  Restore_ScanForExistingFiles: $localize`Scanning existing files …`,
  Restore_ScanForLocalBlocks: $localize`Scanning for local blocks …`,
  Restore_PatchWithLocalBlocks: $localize`Patching files with local blocks …`,
  Restore_DownloadingRemoteFiles: $localize`Downloading files …`,
  Restore_PostRestoreVerify: $localize`Verifying restored files …`,
  Restore_Complete: $localize`Restore complete!`,
  Recreate_Running: $localize`Recreating database …`,
  Vacuum_Running: $localize`Vacuuming database …`,
  Repair_Running: $localize`Repairing database …`,
  Verify_Running: $localize`Verifying files …`,
  BugReport_Running: $localize`Creating bug report …`,
  Delete_Listing: $localize`Listing remote files …`,
  Delete_Deleting: $localize`Deleting remote files …`,
  PurgeFiles_Begin: $localize`Listing remote files for purge …`,
  PurgeFiles_Process: $localize`Purging files …`,
  PurgeFiles_Compact: $localize`Compacting remote data …`,
  PurgeFiles_Complete: $localize`Purging files complete!`,
  Error: $localize`Error!`,
};

@Injectable({
  providedIn: 'root',
})
export class StatusBarState {
  #bytesPipe = inject(BytesPipe);
  #dupServer = inject(DuplicatiServer);
  #backupState = inject(BackupsState);
  #serverState = inject(ServerStateService);
  #dialog = inject(ShipDialogService);
  #sysinfo = inject(SysinfoState);
  #isFetching = signal(false);
  #statusData = signal<StatusWithContent | null>(null);

  statusData = this.#statusData.asReadonly();

  lastState: ServerStatusDto | null = null;
  serverState = computed(() => {
    const serverState = this.#serverState.serverState();

    if (!serverState) return this.lastState;

    serverState.ProposedSchedule =
      serverState.ProposedSchedule?.map((x) => ({
        ...x,
        backup: x.Item1 ? this.#backupState.getBackupById(x.Item1) : null,
      })) ?? null;

    this.lastState = serverState;

    return serverState;
  });

  hasProgressOnWebsocket = computed(
    () => this.#sysinfo.hasProgressSubscribeOption() && this.#serverState.getConnectionMethod() === 'websocket'
  );

  clientIsRunning = computed(() => this.serverState()?.ProgramState === 'Running');

  isResuming = signal<boolean>(false);
  isFetching = this.#isFetching.asReadonly();
  connectionStatus = this.#serverState.connectionStatus;

  pollingInterval: number | undefined;
  #serverStateEffect = effect(() => {
    const serverState = this.#serverState.serverState();
    if (!serverState?.ActiveTask) this.#backupState.getBackups(true);

    if (this.hasProgressOnWebsocket()) {
      this.#serverState.subscribe('progress');
      this.#serverState.subscribe('taskqueue');
    }

    if (serverState?.ActiveTask && this.pollingInterval === undefined) {
      this.startPollingProgress();
    } else if (!serverState?.ActiveTask) {
      this.stopPollingProgress();
    }
  });

  #progressStateEffect = effect(() => {
    const progressState = this.#serverState.progressState();
    const taskqueue = this.#serverState.taskQueueState();
    if (progressState) {
      const task = taskqueue?.find((x) => x.ID === progressState.TaskID) ?? null;
      this.#onProgressStateFetched({ ...progressState, task: task });
    }
  });

  setConnectionMethod(method: 'websocket' | 'longpoll') {
    this.#serverState.setConnectionMethod(method);
  }

  startPollingProgress() {
    // If the server pushes progress updates via WebSocket, we don't need to poll
    if (this.hasProgressOnWebsocket()) {
      this.#serverState.subscribe('progress');
    } else {
      this.pollingInterval = setInterval(() => {
        this.#getProgressState();
      }, 1000);
    }
  }

  stopPollingProgress() {
    clearInterval(this.pollingInterval);
  }

  fetchProgressState() {
    this.#getProgressState();
  }

  pauseResume() {
    this.isResuming.set(true);

    return this.#dupServer.postApiV1ServerstateResume().pipe(finalize(() => this.isResuming.set(false)));
  }

  resumeDialogCheck(cb: Function) {
    if (!this.clientIsRunning()) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Server paused`,
          message: $localize`Server is currently paused. Do you want to resume now?`,
          confirmText: $localize`Resume`,
          cancelText: $localize`No, I'll resume later`,
        },
        closed: (res) => {
          if (!res) return;
          this.pauseResume().subscribe({
            next: () => {
              cb();
            },
          });
        },
      });

      return;
    }

    cb();
  }

  #getProgressState() {
    this.#isFetching.set(true);
    this.#dupServer
      .getApiV1Progressstate()
      .pipe(
        switchMap((x) => {
          const taskId = x.TaskID ?? null;
          if (taskId === null) return of(x);

          return this.#dupServer
            .getApiV1TaskByTaskid({ taskid: taskId })
            .pipe(map((res) => ({ ...x, task: res ?? null })));
        }),
        finalize(() => this.#isFetching.set(false))
      )
      .subscribe({
        next: (res) => {
          this.#onProgressStateFetched(res);
          if (this.serverState()?.ActiveTask == null) {
            this.stopPollingProgress();
          }
        },
        error: (err) => {
          if (err.status === 404) {
            this.stopPollingProgress();
          }
        },
      });
  }

  #onProgressStateFetched(status: Status) {
    const taskId = status.TaskID ?? null;
    const backupId = status.BackupID ?? null;

    if (taskId !== null && backupId !== null) {
      status.backup = this.#backupState.getBackupById(backupId);
    }

    this.#statusData.set({
      ...status,
      progress: this.#calculateProgress(status),
      statusText: this.#constructStatusText(status),
      actionText: status.backup?.Backup?.Name ?? $localize`Running task`,
    });
  }

  #calculateProgress(status: Status): number {
    let pg = -1;

    if (status.task && status) {
      if (status.Phase === 'Backup_ProcessingFiles' || status.Phase === 'Restore_DownloadingRemoteFiles') {
        if (status.StillCounting) {
          pg = 0;
        } else {
          const unaccountedbytes = status.CurrentFilecomplete ? 0 : status.CurrentFileoffset;
          const filesleft = status.TotalFileCount! - status.ProcessedFileCount!;
          const sizeleft = status.TotalFileSize! - status.ProcessedFileSize! - unaccountedbytes!;
          pg = (status.ProcessedFileSize! + unaccountedbytes!) / status.TotalFileSize!;

          if (status.ProcessedFileCount === 0) {
            pg = 0;
          } else if (pg >= 0.9) {
            pg = 0.9;
          }
        }
      } else if (status.Phase === 'Backup_Finalize' || status.Phase === 'Backup_WaitForUpload') {
        pg = 0.9;
      } else if (status.Phase === 'Backup_Delete' || status.Phase === 'Backup_Compact') {
        pg = 0.95;
      } else if (status.Phase === 'Backup_VerificationUpload' || status.Phase === 'Backup_PostBackupVerify') {
        pg = 0.98;
      } else if (status.Phase === 'Backup_Complete') {
        pg = 1;
      } else if (status.OverallProgress! > 0) {
        pg = status.OverallProgress!;
      }
    }

    return pg;
  }

  #constructSpeedText(status: Status): string {
    const aggregateSpeed =
      (status.ActiveTransfers ?? []).map((x) => x.BackendSpeed).reduce((acc, curr) => (acc ?? 0) + (curr ?? 0), 0) ??
      -1;

    const speed = aggregateSpeed <= 0 ? status.BackendSpeed : aggregateSpeed;
    return (speed ?? -1) < 0 ? '' : ` at ${this.#bytesPipe.transform(speed)}/s`;
  }

  #constructStatusText(status: Status): string {
    let text = 'Running …';

    if (status.task && status) {
      text = status.Phase ? STATUS_STATES[status.Phase] : 'Running …';

      // If there is nothing to process, just return the base text
      // This happens during the initial phases of a backup/restore
      if (status.TotalFileCount === 0) return text;

      if (status.Phase === 'Backup_ProcessingFiles' || status.Phase === 'Restore_DownloadingRemoteFiles') {
        if (status.StillCounting) {
          text = `Counting (${status.TotalFileCount} files found, ${this.#bytesPipe.transform(status.TotalFileSize)})`;
        } else {
          const unaccountedbytes = status.CurrentFilecomplete ? 0 : status.CurrentFileoffset;
          const filesleft = status.TotalFileCount! - status.ProcessedFileCount!;
          const sizeleft = status.TotalFileSize! - status.ProcessedFileSize! - unaccountedbytes!;
          const restoringText = status.Phase === 'Restore_DownloadingRemoteFiles' ? 'Restoring: ' : '';
          const speedTxt = this.#constructSpeedText(status);

          if (status.Phase === 'Backup_ProcessingFiles' && filesleft === 0) text = `Completing upload ${speedTxt}`;
          else if (status.BackendIsBlocking ?? false) text = `Waiting for transfers ${speedTxt}`;
          else text = `${restoringText}${filesleft} files (${this.#bytesPipe.transform(sizeleft)}) to go ${speedTxt}`;
        }
      } else if (status.Phase === 'Backup_WaitForUpload') {
        const speedTxt = this.#constructSpeedText(status);
        if (speedTxt !== '') text = `Waiting for upload to finish ${speedTxt}`;
      }
    }
    return text;
  }
}
