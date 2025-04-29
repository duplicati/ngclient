import { inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize, forkJoin, retry, take } from 'rxjs';
import { DuplicatiServerService, GetBackupResultDto } from '../core/openapi';
import { SysinfoState } from '../core/states/sysinfo.state';
import { createRestoreOptionsForm } from './options/options.component';
import { createEncryptionForm } from './restore-encryption/restore-encryption.component';
import { createRestoreSelectFilesForm } from './select-files/select-files.component';

type ListResultFileset = {
    readonly Version: number;
    readonly IsFullBackup?: boolean | undefined;
    readonly Time: string;
    readonly FileCount?: number | undefined;
    readonly FileSizes?: number | undefined;
};

@Injectable({
  providedIn: 'root',
})
export class RestoreFlowState {
  #router = inject(Router);
  #sysinfo = inject(SysinfoState);
  #dupServer = inject(DuplicatiServerService);

  backupId = signal<string | null>(null);
  backup = signal<GetBackupResultDto | null>(null);
  destinationTargetUrl = signal<string | null>(null);
  selectFilesForm = createRestoreSelectFilesForm();
  optionsForm = createRestoreOptionsForm();
  encryptionForm = createEncryptionForm();
  optionsFormSignal = toSignal(this.optionsForm.valueChanges);
  selectFilesFormSignal = toSignal(this.selectFilesForm.valueChanges);
  selectOptionSignal = toSignal(this.selectFilesForm.controls.selectedOption.valueChanges);
  versionOptionsLoading = signal(false);
  versionOptions = signal<ListResultFileset[]>([]);
  isSubmitting = signal(false);
  isDraft = signal(false);
  isFileRestore = signal(false);

  init(id: 'string', isFileRestore = false, isDraft = false) {
    this.backupId.set(id);

    this.isFileRestore.set(isFileRestore);
    this.isDraft.set(isDraft);

    if (isFileRestore) {
      this.#router.navigate(['/restore-from-files/destination']);
    }

    if (!isFileRestore) {
      this.getBackup(id, true);
    }
  }

  updateTargetUrl(targetUrl: string | null) {
    this.destinationTargetUrl.set(targetUrl);
  }

  submit() {
    this.isSubmitting.set(true);
    const id = this.backupId();
    const optionsValue = this.optionsForm.value;
    const selectFilesFormValue = this.selectFilesForm.value;
    const selectedOption = this.versionOptions()?.find((x) => x.Version === selectFilesFormValue.selectedOption);

    this.#dupServer
      .postApiV1BackupByIdRestore({
        id: id ?? '',
        requestBody: {
          paths: selectFilesFormValue.filesToRestore?.split('\0').map((x) => `${x}*`) ?? [],
          passphrase: selectFilesFormValue.passphrase ?? null,
          time: selectedOption?.Time,
          restore_path: optionsValue.restoreFromPath,
          overwrite: optionsValue.handleExisting === 'overwrite',
          permissions: optionsValue.permissions,
          skip_metadata: true,
        },
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => this.exit(),
        error: (err) => {
          console.error('restore error', err);
        },
      });
  }

  exit() {
    // TODOS
    // - Are you sure dialog
    this.#resetAllForms();
    this.#router.navigate(['/']);
  }

  getVersionOptions() {
    this.versionOptions();
  }

  getBackup(id: string, setFirstToForm = false) {
    this.versionOptionsLoading.set(true);

    if (this.#sysinfo.hasV2ListOperations()) {
      forkJoin([
        this.#dupServer.getApiV1BackupById({
          id,
        }),
        this.#dupServer
        .postApiV2BackupListFilesets({
          requestBody: {
            BackupId: id
          }
        })
        .pipe(retry(3))
      ])
        .pipe(
          take(1),
          finalize(() => this.versionOptionsLoading.set(false))
        )
        .subscribe({
          next: ([backup, filesets]) => {
            if (filesets.Error)
              throw new Error(filesets.Error);

            this.versionOptions.set((filesets.Data ?? [])
            .map((x) => ({
              Version: x.Version ?? -1,
              IsFullBackup: x.IsFullBackup ?? undefined,
              Time: x.Time ?? "<missing>",
              FileCount: x.FileCount ?? undefined,
              FileSizes: x.FileSizes ?? undefined,
            })));
            this.backup.set(backup);
          },
        });      
    }
    else
    {
    forkJoin([
      this.#dupServer.getApiV1BackupById({
        id,
      }),
      this.#dupServer
        .getApiV1BackupByIdFilesets({
          id,
        })
        .pipe(retry(3)),
    ])
      .pipe(
        take(1),
        finalize(() => this.versionOptionsLoading.set(false))
      )
      .subscribe({
        next: ([backup, filesets]) => {
          this.versionOptions.set(filesets.map((x) => ({
            Version: x.Version ?? -1,
            IsFullBackup: (x.IsFullBackup ?? 1) == 1,
            Time: x.Time ?? "<missing>",
            FileCount: x.FileCount ?? undefined,
            FileSizes: x.FileSizes ?? undefined,
          })));
          this.backup.set(backup);
        },
      });      
    }



  }

  #resetAllForms() {
    this.selectFilesForm.reset();
    this.optionsForm.reset();
  }
}
