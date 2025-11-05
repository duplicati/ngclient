import { ChangeDetectionStrategy, Component, computed, effect, inject, Signal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ShipButton, ShipDialogService, ShipFormField, ShipIcon, ShipTooltip } from '@ship-ui/core';
import { debounceTime, distinctUntilChanged, finalize, map, take } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';

function debouncedSignal<T>(source: Signal<T>, wait: number) {
  const observable = toObservable(source).pipe(debounceTime(wait), distinctUntilChanged());

  return toSignal(observable, { initialValue: source() });
}

@Component({
  selector: 'app-database',
  imports: [FormsModule, StatusBarComponent, ShipButton, ShipFormField, ShipIcon, ShipTooltip, RouterLink],
  templateUrl: './database.component.html',
  styleUrl: './database.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DatabaseComponent {
  #route = inject(ActivatedRoute);
  #backups = inject(BackupsState);
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #firstDBPath = signal('');

  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
  activeBackup = computed(() => this.#backups.backups().find((x) => x.Backup?.ID === this.backupId()));

  backupFilePath = signal<string>('');
  lastValidatedPath = signal<string>('');
  isValidatedPath = computed(() => this.lastValidatedPath() === this.backupFilePath());
  pathHasChanged = computed(() => this.backupFilePath() !== this.#firstDBPath());
  isValidatingPath = signal(false);
  #debouncedBackupFilePath = debouncedSignal(this.backupFilePath, 500);
  #movedDbPath = signal<boolean>(false);
  isWaitingForValidation = computed(
    () => this.#debouncedBackupFilePath() != this.backupFilePath() || this.isValidatingPath()
  );

  backupFilePathEffect = effect(() => {
    const backupFilePath = this.#debouncedBackupFilePath();
    const _1 = this.activeBackup(); // Also trigger if the backup changes
    const _2 = this.#movedDbPath(); // Also trigger if the movedDbPath changes

    if (backupFilePath === '') return;

    this.isValidatingPath.set(true);
    this.#dupServer
      .postApiV1FilesystemValidate({ requestBody: { path: backupFilePath } })
      .pipe(
        take(1),
        finalize(() => this.isValidatingPath.set(false))
      )
      .subscribe(() => this.lastValidatedPath.set(backupFilePath));
  });

  isRestoring = signal(false);
  isRepairing = signal(false);
  isDeleting = signal(false);
  isSavingDbPath = signal(false);
  isSavingAndRepairing = signal(false);
  isMovingDb = signal(false);
  isCreatingBugReport = signal(false);
  createdReport = signal(false);

  activeBackupEffect = effect(() => {
    const activeBackup = this.activeBackup();

    if (!activeBackup) return;

    const dbPath = activeBackup.Backup?.DBPath ?? '';
    this.backupFilePath.set(dbPath);
    this.#firstDBPath.set(dbPath);
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

  deleteDatabase(callback: (() => void) | null = null) {
    if (this.isValidatedPath()) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Confirm delete?`,
          message: $localize`Do you really want to delete the database for ${this.activeBackup()?.Backup?.Name}?`,
          confirmText: $localize`Delete database`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) return;
          this.doDeleteDatabase(callback);
        },
      });
    } else {
      this.doDeleteDatabase(callback);
    }
  }

  private doDeleteDatabase(callback: (() => void) | null = null) {
    this.isDeleting.set(true);
    this.#dupServer
      .postApiV1BackupByIdDeletedb({ id: this.backupId()! })
      .pipe(
        take(1),
        finalize(() => this.isDeleting.set(false))
      )
      .subscribe(() => {
        this.lastValidatedPath.set('');
        callback?.();
      });
  }

  restoreDatabase() {
    if (this.isValidatedPath()) {
      this.deleteDatabase(() => {
        this.doRepairDatabase();
      });
    } else {
      this.doRepairDatabase();
    }
  }

  private doRepairDatabase() {
    this.isRestoring.set(true);
    this.#dupServer
      .postApiV1BackupByIdRepair({ id: this.backupId()! })
      .pipe(
        take(1),
        finalize(() => this.isRestoring.set(false))
      )
      .subscribe();
  }

  resetDatabasePath() {
    this.backupFilePath.set(this.#firstDBPath());
  }

  saveDatabasePath(callback: (() => void) | null = null) {
    if (this.isValidatedPath()) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Confirm reassign?`,
          message: $localize`The target database path already exists and may belong to another backup. Are you sure you want to assign this backup to an existing database?`,
          confirmText: $localize`Assign existing database`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) return;
          this.doSaveDatabasePath(callback);
        },
      });
    } else {
      this.doSaveDatabasePath(callback);
    }
  }

  private doSaveDatabasePath(callback: (() => void) | null = null) {
    this.isSavingDbPath.set(true);
    const currentPath = this.backupFilePath();
    this.#dupServer
      .postApiV1BackupByIdUpdatedb({
        id: this.backupId()!,
        requestBody: {
          path: currentPath,
        },
      })
      .pipe(finalize(() => this.isSavingDbPath.set(false)))
      .subscribe(() => {
        this.#firstDBPath.set(currentPath);
        callback?.();
      });
  }

  saveAndRepairDatabasePath() {
    this.saveDatabasePath(() => {
      this.isSavingAndRepairing.set(true);
      return this.#dupServer
        .postApiV1BackupByIdRepair({ id: this.backupId()! })
        .pipe(
          take(1),
          finalize(() => this.isSavingAndRepairing.set(false))
        )
        .subscribe();
    });
  }

  moveDatabasePath() {
    this.isMovingDb.set(true);
    const currentPath = this.backupFilePath();

    this.#dupServer
      .postApiV1BackupByIdMovedb({
        id: this.backupId()!,
        requestBody: {
          path: currentPath,
        },
      })
      .pipe(finalize(() => this.isMovingDb.set(false)))
      .subscribe(() => {
        this.#movedDbPath.update((x) => !x);
        this.#firstDBPath.set(currentPath);
      });
  }

  createErrorReport() {
    this.isCreatingBugReport.set(true);
    this.#dupServer
      .postApiV1BackupByIdCreatereport({ id: this.backupId()! })
      .pipe(finalize(() => this.isCreatingBugReport.set(false)))
      .subscribe({
        next: () => {
          this.createdReport.set(true);
          window.setTimeout(() => this.createdReport.set(false), 3000);
        },
      });
  }
}
