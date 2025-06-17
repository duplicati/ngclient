import { inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SparkleDialogService } from '@sparkle-ui/core';
import { catchError, finalize, forkJoin, Observable, retry, switchMap, take, throwError, timer } from 'rxjs';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServerService, GetBackupResultDto, ListFilesetsResponseDto } from '../core/openapi';
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
  #route = inject(ActivatedRoute);
  #sysinfo = inject(SysinfoState);
  #dialog = inject(SparkleDialogService);
  #dupServer = inject(DuplicatiServerService);

  backupId = signal<string | null>(null);
  backup = signal<GetBackupResultDto | null>(null);
  destinationTargetUrl = signal<string | null>(null);
  selectFilesForm = createRestoreSelectFilesForm();
  optionsForm = createRestoreOptionsForm();
  encryptionForm = createEncryptionForm();
  optionsFormSignal = toSignal(this.optionsForm.valueChanges);
  selectFilesFormSignal = toSignal(this.selectFilesForm.valueChanges);
  selectOption = signal<string | null>(null);
  versionOptionsLoading = signal(false);
  versionOptions = signal<ListResultFileset[]>([]);
  isSubmitting = signal(false);
  isFileRestore = signal(false);
  isFullWidthPage = signal(false);

  init(id: 'string', isFileRestore = false) {
    this.backupId.set(id);

    this.isFileRestore.set(isFileRestore);

    if (isFileRestore) {
      this.#router.navigate(['/restore-from-files/destination']);
    }

    if (!isFileRestore) {
      this.getBackup(true);
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
    const _selectedOption = this.selectOption();
    const selectedOption = this.versionOptions()?.find(
      (x) => x.Version === (_selectedOption && parseInt(_selectedOption))
    );

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
        next: () => {
          this.#router.navigate(['./progress'], { relativeTo: this.#route });
        },
        error: (err) => {
          console.error('restore error', err);
        },
      });
  }

  exit() {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm exit?`,
        message: $localize`Are you sure you want to exit?`,
        confirmText: $localize`Yes`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        this.#resetAllForms();
        this.#router.navigate(['/']);
      },
    });
  }

  getVersionOptions() {
    this.versionOptions();
  }

  private loadFilesetsWithRetryv2(id: string, retriesLeft: number = 2): Observable<ListFilesetsResponseDto> {
    return this.#dupServer.postApiV2BackupListFilesets({ requestBody: { BackupId: id } }).pipe(
      catchError((err) => {
        const isEncryptedError = err?.error?.body?.StatusCode === 'EncryptedStorageNoPassphrase';
        const isNotFoundError = err?.error?.body?.StatusCode === 'FolderMissing';
        const isEmptyFolderError = err?.error?.body?.StatusCode === 'EmptyRemoteFolder';

        if (isEncryptedError || isNotFoundError || isEmptyFolderError || retriesLeft === 0) {
          return throwError(() => err);
        }

        return timer(1000).pipe(switchMap(() => this.loadFilesetsWithRetryv2(id, retriesLeft - 1)));
      })
    );
  }

  getBackup(setFirstToForm = false) {
    const id = this.backupId()!;

    this.versionOptionsLoading.set(true);

    if (this.#sysinfo.hasV2ListOperations()) {
      forkJoin([
        this.#dupServer.getApiV1BackupById({
          id,
        }),
        this.loadFilesetsWithRetryv2(id),
      ])
        .pipe(
          take(1),
          finalize(() => this.versionOptionsLoading.set(false))
        )
        .subscribe({
          next: ([backup, filesets]) => {
            if (filesets.Error) throw new Error(filesets.Error);
            const isTemporary = backup.Backup?.IsTemporary ?? true;
            if (!isTemporary && backup?.Backup?.DBPathExists === false) {
              this.#dialog.open(ConfirmDialogComponent, {
                data: {
                  title: $localize`Missing Local Database`,
                  message: $localize`The local database for this backup is missing. Please repair or recreate the local database before restoring.`,
                  confirmText: $localize`OK`,
                  cancelText: undefined,
                },
                closed: (_) => {
                  this.#router.navigate([
                    '/backup', id, 'database'
                  ]);
                },
              });
              
              return;
            }
              throw new Error($localize`The Backup does not have a local database. Please repair/recreate the local database before restoring.`);

            this.versionOptions.set(
              (filesets.Data ?? []).map((x) => ({
                Version: x.Version ?? -1,
                IsFullBackup: x.IsFullBackup ?? undefined,
                Time: x.Time ?? '<missing>',
                FileCount: x.FileCount ?? undefined,
                FileSizes: x.FileSizes ?? undefined,
              }))
            );
            this.backup.set(backup);
          },
          error: (err) => {
            const isEncryptedError = err?.error?.body?.StatusCode === 'EncryptedStorageNoPassphrase';
            const isNotFoundError = err?.error?.body?.StatusCode === 'FolderMissing';
            const isEmptyFolderError = err?.error?.body?.StatusCode === 'EmptyRemoteFolder';

            let errorMessage = $localize`An error occurred while loading the backup filesets: ${err.message}`;
            if (isEncryptedError)
              errorMessage = $localize`The remote storage is encrypted. Please enter the passphrase to access the backup.`;
            if (isNotFoundError) errorMessage = $localize`The backup storage folder was not found.`;
            if (isEmptyFolderError) errorMessage = $localize`The backup storage folder does not contain any filesets.`;

            this.#dialog.open(ConfirmDialogComponent, {
              data: {
                title: $localize`Failed to load backup filesets`,
                message: errorMessage,
                confirmText: $localize`OK`,
                cancelText: undefined,
              },
              closed: (_) => {
                this.#router.navigate([
                  isEncryptedError ? '/restore-from-files/encryption' : '/restore-from-files/destination',
                ]);
              },
            });
          },
        });
    } else {
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
            this.versionOptions.set(
              filesets.map((x) => ({
                Version: x.Version ?? -1,
                IsFullBackup: (x.IsFullBackup ?? 1) == 1,
                Time: x.Time ?? '<missing>',
                FileCount: x.FileCount ?? undefined,
                FileSizes: x.FileSizes ?? undefined,
              }))
            );
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
