import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { finalize, map, of, switchMap } from 'rxjs';
import {
  DuplicatiServerService,
  GetApiV1ProgressstateResponse,
  GetApiV1TaskByTaskidResponse,
  ProgressStateService,
  ServerStatusDto,
} from '../../openapi';
import { BytesPipe } from '../../pipes/byte.pipe';
import { ServerStateService } from '../../services/server-state.service';
import { Backup, BackupsState } from '../../states/backups.state';
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
  'PurgeFiles_Begin,': $localize`Listing remote files for purge …`,
  'PurgeFiles_Process,': $localize`Purging files …`,
  'PurgeFiles_Compact,': $localize`Compacting remote data …`,
  'PurgeFiles_Complete,': $localize`Purging files complete!`,
  Error: $localize`Error!`,
};

@Injectable({
  providedIn: 'root',
})
export class StatusBarState {
  #bytesPipe = inject(BytesPipe);
  #progState = inject(ProgressStateService);
  #dupServer = inject(DuplicatiServerService);
  #backupState = inject(BackupsState);
  #serverState = inject(ServerStateService);
  #isFetching = signal(false);
  #statusData = signal<StatusWithContent | null>(null);

  statusData = this.#statusData.asReadonly();

  lastState: ServerStatusDto | null = null;
  serverState = computed(() => {
    const serverState = this.#serverState.serverState();

    if (!serverState) return this.lastState;

    serverState.ProposedSchedule = serverState.ProposedSchedule?.map((x) => ({
      ...x,
      backup: x.Item1 ? this.#backupState.getBackupById(x.Item1) : null,
    }));

    this.lastState = serverState;

    return serverState;
  });

  serverStateEffect = effect(() => {
    const newState = this.#serverState.serverState();

    if (!newState?.ActiveTask) {
      this.#backupState.getBackups(true);
    }
  });

  isFetching = this.#isFetching.asReadonly();
  connectionStatus = this.#serverState.connectionStatus;

  pollingInterval: number | undefined;
  #serverStateEffect = effect(() => {
    const serverState = this.#serverState.serverState();

    if (serverState?.ActiveTask && this.pollingInterval === undefined) {
      this.startPollingProgress();
    } else if (!serverState?.ActiveTask) {
      this.stopPollingProgress();
    }
  });

  setConnectionMethod(method: 'websocket' | 'longpoll') {
    this.#serverState.setConnectionMethod(method);
  }

  startPollingProgress() {
    this.pollingInterval = setInterval(() => {
      this.#getProgressState();
    }, 1000);
  }

  stopPollingProgress() {
    clearInterval(this.pollingInterval);
  }

  fetchProgressState() {
    this.#getProgressState();
  }

  #getProgressState() {
    this.#isFetching.set(true);
    this.#progState
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
        next: (res: Status) => {
          const taskId = res.TaskID ?? null;
          const backupId = res.BackupID ?? null;

          if (taskId !== null && backupId !== null) {
            res.backup = this.#backupState.getBackupById(backupId);
          }

          console.log('res', res);

          this.#statusData.set({
            ...res,
            progress: this.#calculateProgress(res),
            statusText: this.#constructStatusText(res),
            actionText: res.backup?.Backup?.Name ?? $localize`Running task`,
          });

          if (res.task?.Status === 'Completed') {
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
      } else if (status.Phase === 'Backup_Complete' || status.Phase === 'Backup_WaitForUpload') {
        pg = 1;
      } else if (status.OverallProgress! > 0) {
        pg = status.OverallProgress!;
      }
    }

    return pg;
  }

  #constructStatusText(status: Status): string {
    let text = 'Running …';

    if (status.task && status) {
      text = status.Phase ? STATUS_STATES[status.Phase] : 'Running …';

      if (status.Phase === 'Backup_ProcessingFiles' || status.Phase === 'Restore_DownloadingRemoteFiles') {
        if (status.StillCounting) {
          text = `Counting (${status.TotalFileCount} files found, ${this.#bytesPipe.transform(status.TotalFileSize)})`;
        } else {
          const unaccountedbytes = status.CurrentFilecomplete ? 0 : status.CurrentFileoffset;
          const filesleft = status.TotalFileCount! - status.ProcessedFileCount!;
          const sizeleft = status.TotalFileSize! - status.ProcessedFileSize! - unaccountedbytes!;
          const speedTxt = status.BackendSpeed! < 0 ? '' : ` at ${this.#bytesPipe.transform(status.BackendSpeed)}/s`;
          const restoringText = status.Phase === 'Restore_DownloadingRemoteFiles' ? 'Restoring: ' : '';

          text = `${restoringText}${filesleft} files (${this.#bytesPipe.transform(sizeleft)}) to go ${speedTxt}`;
        }
      }
    }
    return text;
  }
}
