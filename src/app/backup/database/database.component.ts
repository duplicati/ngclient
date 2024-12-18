import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SparkleButtonComponent, SparkleFormFieldComponent, SparkleIconComponent } from '@sparkle-ui/core';
import { finalize, map, switchMap, take } from 'rxjs';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { DuplicatiServerService } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';

@Component({
  selector: 'app-database',
  imports: [FormsModule, StatusBarComponent, SparkleButtonComponent, SparkleFormFieldComponent, SparkleIconComponent],
  templateUrl: './database.component.html',
  styleUrl: './database.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DatabaseComponent {
  #route = inject(ActivatedRoute);
  #backups = inject(BackupsState);
  #dupServer = inject(DuplicatiServerService);
  #firstDBPath = '';

  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
  activeBackup = computed(() => {
    const activeBackup = this.#backups.backups().find((x) => x.Backup?.ID === this.backupId());

    this.#firstDBPath = activeBackup?.Backup?.DBPath ?? '';

    return activeBackup;
  });

  backupFilePath = signal<string>('');
  lastValidatedPath = signal<string>('');
  isValidatedPath = computed(() => this.lastValidatedPath() === this.backupFilePath());

  backupFilePathEffect = effect(() => {
    const backupFilePath = this.backupFilePath();

    if (backupFilePath === '') return;

    this.#dupServer.postApiV1FilesystemValidate({ requestBody: { path: backupFilePath } }).subscribe({
      next: () => this.lastValidatedPath.set(backupFilePath),
    });
  });
  isRestoring = signal(false);
  isRepairing = signal(false);
  isDeleting = signal(false);
  isSavingDbPath = signal(false);
  isSavingAndRepairing = signal(false);
  isMovingDb = signal(false);

  activeBackupEffect = effect(() => {
    const activeBackup = this.activeBackup();

    if (!activeBackup) return;

    const dbPath = activeBackup.Backup?.DBPath ?? '';
    this.backupFilePath.set(dbPath);
  });

  repairDatabase() {
    this.isRepairing.set(true);
    this.#dupServer
      .postApiV1BackupByIdRepair({ id: this.backupId()! })
      .pipe(
        take(1),
        finalize(() => this.isRepairing.set(false))
      )
      .subscribe();
  }

  deleteDatabase() {
    this.isDeleting.set(true);
    this.#dupServer
      .postApiV1BackupByIdDeletedb({ id: this.backupId()! })
      .pipe(
        take(1),
        finalize(() => this.isDeleting.set(false))
      )
      .subscribe();
  }

  restoreDatabase() {
    this.isRestoring.set(true);
    this.#dupServer
      .postApiV1BackupByIdDeletedb({ id: this.backupId()! })
      .pipe(
        take(1),
        switchMap(() => this.#dupServer.postApiV1BackupByIdRepair({ id: this.backupId()! })),
        finalize(() => this.isRestoring.set(false))
      )
      .subscribe();
  }

  resetDatabasePath() {
    this.backupFilePath.set(this.#firstDBPath);
  }

  saveDatabasePath() {
    this.isSavingDbPath.set(true);
    this.#dupServer
      .postApiV1BackupByIdUpdatedb({
        id: this.backupId()!,
        requestBody: {
          path: this.backupFilePath(),
        },
      })
      .pipe(finalize(() => this.isSavingDbPath.set(false)))
      .subscribe();
  }

  saveAndRepairDatabasePath() {
    this.isSavingAndRepairing.set(true);
    this.#dupServer
      .postApiV1BackupByIdUpdatedb({
        id: this.backupId()!,
        requestBody: {
          path: this.backupFilePath(),
        },
      })
      .pipe(
        switchMap(() => {
          return this.#dupServer.postApiV1BackupByIdRepair({ id: this.backupId()! });
        }),
        finalize(() => this.isSavingAndRepairing.set(false))
      );
  }

  moveDatabasePath() {
    this.isMovingDb.set(true);
    this.#dupServer
      .postApiV1BackupByIdMovedb({
        id: this.backupId()!,
        requestBody: {
          path: this.backupFilePath(),
        },
      })
      .pipe(finalize(() => this.isMovingDb.set(false)))
      .subscribe();
  }
}
