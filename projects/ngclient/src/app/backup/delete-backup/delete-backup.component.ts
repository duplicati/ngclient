import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { catchError, defer, finalize, map, of } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { BackupsState } from '../../core/states/backups.state';

@Component({
  selector: 'app-delete-backup',
  imports: [ShipCheckbox, ShipButton, ShipIcon, BytesPipe, FormsModule, RouterLink],
  templateUrl: './delete-backup.component.html',
  styleUrl: './delete-backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DeleteBackupComponent {
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #router = inject(Router);

  id = input.required<string>();
  backupResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) => defer(() => this.#dupServer.getApiV1BackupById({ path: params })),
  });
  backup = computed(() =>
    !this.backupResource.isLoading() && this.backupResource.hasValue() ? this.backupResource.value() : undefined
  );
  canDelete = computed(() => this.backup()?.Backup?.ID === this.id());
  isSyncMode = computed(() => this.backup()?.Backup?.OperationType === 'Sync');
  noLocalDbResource = rxResource({
    params: () =>
      this.canDelete() && this.backup()?.Backup?.DBPath ? { dbPath: this.backup()!.Backup!.DBPath } : undefined,
    stream: ({ params }) =>
      defer(() => this.#dupServer.postApiV1FilesystemValidate({ body: { path: params.dbPath } })).pipe(
        map(() => true),
        catchError(() => of(false))
      ),
  });
  fileCount = computed(() => parseInt(this.backup()?.Backup?.Metadata?.['TargetFilesCount'] ?? '0', 10));

  databaseUsage = rxResource({
    params: () => (this.canDelete() && this.backup()?.Backup?.DBPath ? { id: this.id() } : undefined),
    stream: ({ params }) => defer(() => this.#dupServer.getApiV1BackupByIdIsdbusedelsewhere({ path: params })),
  });
  canDeleteLocalDb = computed(
    () => !this.databaseUsage.isLoading() && !this.databaseUsage.error() && this.databaseUsage.value()?.inuse === false
  );

  deleteLocalDb = signal(false);
  deleteRemoteFiles = signal(false);
  isDeleting = signal(false);
  #routeVersion = 0;
  #resetForRoute = effect(() => {
    this.id();
    this.#routeVersion++;
    this.deleteLocalDb.set(false);
    this.deleteRemoteFiles.set(false);
    this.isDeleting.set(false);
  });
  #keepSharedDatabase = effect(() => {
    if (!this.canDeleteLocalDb()) this.deleteLocalDb.set(false);
  });

  deleteBackup() {
    if (!this.canDelete() || this.isDeleting()) return;
    const id = this.id();
    const version = this.#routeVersion;
    const deleteLocalDb = this.canDeleteLocalDb() && this.deleteLocalDb();
    const deleteRemoteFiles = this.isSyncMode() ? undefined : this.deleteRemoteFiles();

    this.isDeleting.set(true);
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm delete`,
        message: $localize`Are you sure you want to delete this backup?`,
        confirmText: $localize`Delete backup`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (version !== this.#routeVersion) return;
        if (!res) {
          this.isDeleting.set(false);
          return;
        }
        this.#backupsState
          .deleteBackup({
            path: { id },
            query: {
              'delete-local-db': deleteLocalDb,
              ...(deleteRemoteFiles === undefined ? {} : { 'delete-remote-files': deleteRemoteFiles }),
            },
          })
          .pipe(
            finalize(() => {
              if (version === this.#routeVersion) this.isDeleting.set(false);
            })
          )
          .subscribe({
            next: () => {
              if (version === this.#routeVersion) this.#router.navigate(['/']);
            },
            // HTTP errors are reported by the shared interceptor; finalize permits retry.
            error: () => {},
          });
      },
    });
  }
}
