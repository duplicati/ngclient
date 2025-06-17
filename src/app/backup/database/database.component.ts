import { ChangeDetectionStrategy, Component, computed, effect, inject, Signal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SparkleButtonComponent, SparkleFormFieldComponent, SparkleIconComponent, SparkleTooltipDirective } from '@sparkle-ui/core';
import { debounceTime, distinctUntilChanged, finalize, map, switchMap, take, tap } from 'rxjs';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { DuplicatiServerService } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';

function debouncedSignal<T>(
  source: Signal<T>,
  wait: number
) {
  const observable = toObservable(source).pipe(
    debounceTime(wait),
    distinctUntilChanged()
  );

  return toSignal(observable, { initialValue: source() });
}

@Component({
  selector: 'app-database',
  imports: [
    FormsModule,
    StatusBarComponent,
    SparkleButtonComponent,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleTooltipDirective,    
    RouterLink,
  ],
  templateUrl: './database.component.html',
  styleUrl: './database.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DatabaseComponent {
  #route = inject(ActivatedRoute);
  #backups = inject(BackupsState);
  #dupServer = inject(DuplicatiServerService);
  #firstDBPath = signal('');

  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
  activeBackup = computed(() => {
    const activeBackup = this.#backups.backups().find((x) => x.Backup?.ID === this.backupId());
    return activeBackup;
  });

  backupFilePath = signal<string>('');
  lastValidatedPath = signal<string>('');
  isValidatedPath = computed(() => this.lastValidatedPath() === this.backupFilePath());
  pathHasChanged = computed(() => this.backupFilePath() !== this.#firstDBPath());

  #debouncedBackupFilePath = debouncedSignal(this.backupFilePath, 500);

  backupFilePathEffect = effect(() => {
    const backupFilePath = this.#debouncedBackupFilePath();

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
    console.log('Active Backup:', activeBackup);

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

  deleteDatabase() {
    this.isDeleting.set(true);
    this.#dupServer
      .postApiV1BackupByIdDeletedb({ id: this.backupId()! })
      .pipe(
        take(1),
        finalize(() => this.isDeleting.set(false))
      )
      .subscribe(() => this.lastValidatedPath.set(''));
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
    this.backupFilePath.set(this.#firstDBPath());
  }

  saveDatabasePath() {
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
      .subscribe(() => this.#firstDBPath.set(currentPath));
  }

  saveAndRepairDatabasePath() {
    this.isSavingAndRepairing.set(true);
    const currentPath = this.backupFilePath();

    this.#dupServer
      .postApiV1BackupByIdUpdatedb({
        id: this.backupId()!,
        requestBody: {
          path: currentPath,
        },
      })
      .pipe(
        tap(() => this.#firstDBPath.set(currentPath)),
        switchMap(() => {
          return this.#dupServer.postApiV1BackupByIdRepair({ id: this.backupId()! });
        }),
        finalize(() => this.isSavingAndRepairing.set(false))
      ).subscribe();
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
      .subscribe(() => this.#firstDBPath.set(currentPath));
  }
}
