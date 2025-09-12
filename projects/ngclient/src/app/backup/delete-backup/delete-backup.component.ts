import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ShipButtonComponent, ShipCheckboxComponent, ShipDialogService, ShipIconComponent } from '@ship-ui/core';
import { catchError, finalize, map, of } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { BackupsState } from '../../core/states/backups.state';

@Component({
  selector: 'app-delete-backup',
  imports: [ShipCheckboxComponent, ShipButtonComponent, ShipIconComponent, BytesPipe, FormsModule, RouterLink],
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
  backup = computed(() => this.#backupsState.getBackupById(this.id()));
  noLocalDbResource = rxResource({
    params: () => ({ dbPath: this.backup()?.Backup?.DBPath }),
    stream: ({ params }) =>
      this.#dupServer.postApiV1FilesystemValidate({ requestBody: { path: params.dbPath } }).pipe(
        map(() => true),
        catchError(() => of(false))
      ),
  });
  fileCount = computed(() => parseInt(this.backup()?.Backup?.Metadata?.['TargetFilesCount'] ?? '0', 10));

  deleteLocalDb = signal(false);
  deleteRemoteFiles = signal(false);
  isDeleting = signal(false);

  deleteBackup() {
    const id = this.id();
    const deleteLocalDb = this.deleteLocalDb();
    const deleteRemoteFiles = this.deleteRemoteFiles();

    this.isDeleting.set(true);
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm delete`,
        message: $localize`Are you sure you want to delete this backup?`,
        confirmText: $localize`Delete backup`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        this.#backupsState
          .deleteBackup({
            id,
            deleteLocalDb: deleteLocalDb,
            deleteRemoteFiles: deleteRemoteFiles,
          })
          .pipe(finalize(() => this.isDeleting.set(false)))
          .subscribe({
            next: () => {
              this.#router.navigate(['/']);
            },
          });
      },
    });
  }
}
