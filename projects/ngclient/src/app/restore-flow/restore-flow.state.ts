import { computed, effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import {
  catchError,
  defer,
  filter,
  finalize,
  forkJoin,
  map,
  Observable,
  of,
  repeat,
  retry,
  Subscription,
  switchMap,
  take,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { TestState } from '../backup/source-data/target-url-dialog/test-url/test-url';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, GetBackupResultDto, ListFilesetsResponseDto, SettingInputDto } from '../core/openapi';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { createRestoreOptionsForm } from './options/options.component';
import { resolveRestoreOptionDefaults } from './options/restore-option-defaults';
import { createEncryptionForm } from './restore-encryption/restore-encryption.component';
import { createRestoreSelectFilesForm } from './select-files/select-files.component';

type ListResultFileset = {
  readonly Version: number;
  readonly IsFullBackup?: boolean | undefined;
  readonly Time: string;
  readonly FileCount?: number | undefined;
  readonly FileSizes?: number | undefined;
  readonly Label?: string | null | undefined;
};

@Injectable({
  providedIn: 'root',
})
export class RestoreFlowState implements OnDestroy {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #sysinfo = inject(SysinfoState);
  #dialog = inject(ShipDialogService);
  #dupServer = inject(DuplicatiServer);
  #serverSettings = inject(ServerSettingsService);
  #restoreOptionsInitializedForBackupId: string | null = null;
  #backupLoad: Subscription | undefined;
  #destroyed = false;

  backupId = signal<string | null>(null);
  backup = signal<GetBackupResultDto | null>(null);
  /** A Sync job restores from the copies on its destination, not from a backup database */
  isSync = computed(() => this.backup()?.Backup?.OperationType === 'Sync');
  destinationTargetUrl = signal<string | null>(null);
  destinationConnectionStringId = signal<number | null>(null);
  destinationTestSignal = signal<TestState>(null);
  selectFilesForm = createRestoreSelectFilesForm();
  optionsForm = createRestoreOptionsForm();
  encryptionForm = createEncryptionForm();
  optionsFormSignal = toSignal(this.optionsForm.valueChanges);
  selectFilesFormSignal = toSignal(this.selectFilesForm.valueChanges);
  selectOption = signal<string | null>(null);
  versionOptionsLoading = signal(false);
  waitingForBackup = signal(false);
  versionOptions = signal<ListResultFileset[]>([]);
  isSubmitting = signal(false);
  isFileRestore = signal(false);
  isFullWidthPage = signal(false);
  extendedDataType = signal<string | null>(null);
  alternateRestorePath = signal<string | null>(null);
  alternateRestorePathSourcePrefix = signal<string | null>(null);
  advancedOptions = signal<SettingInputDto[]>([]);

  // Hyper-V machines are stored below this virtual root in a backup
  #hyperVRoot = '\\\\duplicati\\hyperv\\';

  hasHyperVItemsSelected = computed(() => {
    const files = (this.selectFilesFormSignal()?.filesToRestore ?? this.selectFilesForm.value.filesToRestore ?? '')
      .split('\0')
      .filter((x) => x !== '');

    // Restoring without a selection restores everything in the backup
    if (files.length === 0)
      return (this.backup()?.Backup?.Sources ?? []).some((x) => x.toUpperCase().startsWith('%HYPERV%'));

    return files.some((x) => x.toLowerCase().startsWith(this.#hyperVRoot));
  });

  canRegisterRestoredItems = computed(() => this.#sysinfo.hasRegisterRestoredItems() && this.hasHyperVItemsSelected());

  #initializeRestoreOptions = effect(() => {
    const backupId = this.backupId();
    const backup = this.backup()?.Backup;
    const serverSettings = this.#serverSettings.serverSettings();

    if (!backupId || !backup || serverSettings === undefined) return;
    if (backup.ID !== null && backup.ID !== backupId) return;
    if (this.#restoreOptionsInitializedForBackupId === backupId) return;

    this.#restoreOptionsInitializedForBackupId = backupId;
    this.optionsForm.patchValue(resolveRestoreOptionDefaults(backup.Settings, serverSettings));
  });

  init(id: 'string', isFileRestore = false) {
    this.#cancelBackupLoad();
    this.backupId.set(id);

    this.isFileRestore.set(isFileRestore);
    this.alternateRestorePath.set(null);
    this.extendedDataType.set(null);
    this.advancedOptions.set([]);

    if (isFileRestore) {
      this.#router.navigate(['/restore-from-files/destination']);
    }

    if (!isFileRestore) {
      this.getBackup();
    }
  }

  updateTargetUrl(targetUrl: string | null, connectionStringId: number | null = null) {
    this.destinationTargetUrl.set(targetUrl);
    this.destinationConnectionStringId.set(targetUrl ? connectionStringId : null);
    // Different saved connections can have the same masked URL.
    this.destinationTestSignal.set(null);
  }

  setAlternateRestorePath(path: string | null, prefix: string | null) {
    this.alternateRestorePath.set(path);
    this.alternateRestorePathSourcePrefix.set(prefix);
  }

  submit() {
    this.isSubmitting.set(true);
    const id = this.backupId();
    const isTemporary = this.backup()?.Backup?.IsTemporary ?? false;

    if (isTemporary) {
      // If this is a temporary backup, we have a partial database created for the file picking step.
      // We need to create a fresh temporary backup with no database, so the restore flow creates a partial database for the restore.
      defer(() =>
        this.#dupServer.postApiV1BackupByIdCopytotemp({
          path: { id: this.backupId() ?? '' },
        })
      ).subscribe({
        next: (res) => {
          this.#submitRestore(res.ID ?? '');
        },
        error: (err) =>
          this.showErrorDialog(
            $localize`An error occurred while copying the backup to a temporary location: ${err.message}`
          ),
      });
    } else {
      this.#submitRestore(id ?? '');
    }
  }

  showErrorDialog(message: string) {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Error occured`,
        message: message,
        confirmText: $localize`OK`,
        cancelText: undefined,
      },
      closed: (_) => {},
    });
  }

  #submitRestore(id: string) {
    const optionsValue = this.optionsForm.value;
    const selectFilesFormValue = this.selectFilesForm.value;
    const _selectedOption = this.selectOption();
    const selectedOption = this.versionOptions()?.find(
      (x) => x.Version === (_selectedOption && parseInt(_selectedOption))
    );

    defer(() =>
      this.#dupServer.postApiV1BackupByIdRestore({
        path: { id: id ?? '' },
        body: {
          paths:
            selectFilesFormValue.filesToRestore
              ?.split('\0')
              .map((x) => (x.endsWith('/') || x.endsWith('\\') ? `${x}*` : x)) ?? [],
          passphrase: selectFilesFormValue.passphrase ?? null,
          time: selectedOption?.Time,
          restore_path: this.alternateRestorePath() ?? optionsValue.restoreFromPath,
          overwrite: optionsValue.handleExisting === 'overwrite',
          permissions: optionsValue.permissions,
          skip_metadata: !optionsValue.includeMetadata,
          source_prefix: this.alternateRestorePathSourcePrefix(),
          connection_string_id: null,
          options: this.#getRestoreOptions(
            this.canRegisterRestoredItems() && (optionsValue.registerRestoredItems ?? false)
          ),
        },
      })
    )
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (res) => {
          this.#router.navigate([`./${res.ID}`, 'progress'], { relativeTo: this.#route });
        },
        error: (err) => {
          console.error('restore error', err);
        },
      });
  }

  #getRestoreOptions(registerRestoredItems: boolean) {
    if (!this.#sysinfo.hasRestoreOptions()) return undefined;

    const options: Record<string, string | null> = {};

    for (const setting of this.advancedOptions()) {
      const name = setting.Name?.trim().replace(/^-+/, '');
      if (name) options[name] = setting.Value ?? '';
    }

    if (registerRestoredItems) options['register-restored-items'] = 'true';

    return Object.keys(options).length > 0 ? options : null;
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

  private waitForBackupIdle(id: string) {
    return defer(() => this.#dupServer.getApiV1BackupByIdIsactive({ path: { id } })).pipe(
      repeat({ delay: 1000 }),
      tap((activity) => this.waitingForBackup.set(activity.Active === true)),
      filter((activity) => activity.Active !== true),
      take(1)
    );
  }

  private loadRestoreBackupv2(id: string) {
    return this.waitForBackupIdle(id).pipe(
      switchMap(() => this.loadFilesetsWithRetryv2(id)),
      switchMap((filesets) =>
        defer(() => this.#dupServer.getApiV1BackupById({ path: { id } })).pipe(
          map((backup) => [backup, filesets] as const)
        )
      ),
      switchMap((result) => {
        const backup = result[0].Backup;
        if ((backup?.IsTemporary ?? true) || backup?.DBPathExists !== false) return of({ result, retry: false });

        // A task can start between the initial idle check and the metadata response.
        return defer(() => this.#dupServer.getApiV1BackupByIdIsactive({ path: { id } })).pipe(
          map((activity) => ({ result, retry: activity.Active === true })),
          tap(({ retry }) => this.waitingForBackup.set(retry))
        );
      }),
      repeat({ delay: 1000 }),
      filter(({ retry }) => !retry),
      take(1),
      map(({ result }) => result)
    );
  }

  private loadFilesetsWithRetryv2(id: string, retriesLeft: number = 2): Observable<ListFilesetsResponseDto> {
    return defer(() => this.#dupServer.postApiV2BackupListFilesets({ body: { BackupId: id } })).pipe(
      catchError((err) => {
        const statusCode = err?.error?.body?.StatusCode ?? err?.error?.requestBody?.StatusCode;
        const isEncryptedError = statusCode === 'EncryptedStorageNoPassphrase';
        const isNotFoundError = statusCode === 'FolderMissing';
        const isEmptyFolderError = statusCode === 'EmptyRemoteFolder';

        if (isEncryptedError || isNotFoundError || isEmptyFolderError || retriesLeft === 0) {
          return throwError(() => err);
        }

        return timer(1000).pipe(
          switchMap(() => (statusCode === 'DatabaseLocked' ? this.waitForBackupIdle(id) : of(null))),
          switchMap(() => this.loadFilesetsWithRetryv2(id, retriesLeft - 1))
        );
      })
    );
  }

  getBackup() {
    if (this.#destroyed) return;
    this.#cancelBackupLoad();
    const id = this.backupId()!;

    this.versionOptionsLoading.set(true);

    if (this.#sysinfo.hasV2ListOperations()) {
      this.versionOptions.set([]);
      this.backup.set(null);
      const request = new Subscription();
      this.#backupLoad = request;
      request.add(
        this.loadRestoreBackupv2(id)
          .pipe(
            take(1),
            finalize(() => {
              if (this.#backupLoad !== request) return;
              this.#backupLoad = undefined;
              this.waitingForBackup.set(false);
              this.versionOptionsLoading.set(false);
            })
          )
          .subscribe({
            next: ([backup, filesets]) => {
              if (filesets.Error) throw new Error(filesets.Error);
              const isTemporary = backup.Backup?.IsTemporary ?? true;
              // A Sync job lists and restores from its destination, so it needs no local database
              const isSync = backup.Backup?.OperationType === 'Sync';
              if (!isTemporary && !isSync && backup?.Backup?.DBPathExists === false) {
                this.#dialog.open(ConfirmDialogComponent, {
                  data: {
                    title: $localize`Missing Local Database`,
                    message: $localize`The local database for this backup is missing. Please repair or recreate the local database before restoring.`,
                    confirmText: $localize`OK`,
                    cancelText: undefined,
                  },
                  closed: (_) => {
                    this.#router.navigate(['/backup', id, 'database']);
                  },
                });

                return;
              }

              this.versionOptions.set(
                (filesets.Data ?? []).map((x) => ({
                  Version: x.Version ?? -1,
                  IsFullBackup: x.IsFullBackup ?? undefined,
                  Time: x.Time ?? '<missing>',
                  FileCount: x.FileCount ?? undefined,
                  FileSizes: x.FileSizes ?? undefined,
                  Label: x.Label ?? undefined,
                }))
              );
              this.backup.set(backup);
            },
            error: (err) => {
              const statusCode = err?.error?.body?.StatusCode ?? err?.error?.requestBody?.StatusCode;
              if (statusCode === 'DatabaseLocked') {
                this.#dialog.open(ConfirmDialogComponent, {
                  data: {
                    title: $localize`Backup database is busy`,
                    message: $localize`A backup or another operation is using the local database. Wait for it to finish, then retry.`,
                    confirmText: $localize`Retry`,
                    cancelText: $localize`Cancel`,
                  },
                  closed: (retry) => {
                    if (retry && !this.#destroyed && this.backupId() === id) this.getBackup();
                  },
                });
                return;
              }
              const isEncryptedError = statusCode === 'EncryptedStorageNoPassphrase';
              const isNotFoundError = statusCode === 'FolderMissing';
              const isEmptyFolderError = statusCode === 'EmptyRemoteFolder';

              let errorMessage = $localize`An error occurred while loading the backup filesets: ${err.message}`;
              if (isEncryptedError)
                errorMessage = $localize`The remote storage is encrypted. Please enter the passphrase to access the backup.`;
              if (isNotFoundError) errorMessage = $localize`The backup storage folder was not found.`;
              if (isEmptyFolderError)
                errorMessage = $localize`The backup storage folder does not contain any filesets.`;

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
          })
      );
    } else {
      forkJoin([
        defer(() =>
          this.#dupServer.getApiV1BackupById({
            path: { id },
          })
        ),
        defer(() =>
          this.#dupServer.getApiV1BackupByIdFilesets({
            path: { id },
          })
        ).pipe(retry(3)),
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
                Label: x.Label ?? undefined,
              }))
            );
            this.backup.set(backup);
          },
        });
    }
  }

  #cancelBackupLoad() {
    this.#backupLoad?.unsubscribe();
    this.#backupLoad = undefined;
    this.waitingForBackup.set(false);
  }

  ngOnDestroy() {
    this.#destroyed = true;
    this.#cancelBackupLoad();
  }

  #resetAllForms() {
    this.selectFilesForm.reset();
    this.optionsForm.reset();
    this.advancedOptions.set([]);
  }
}
