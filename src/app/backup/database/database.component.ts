import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SparkleButtonComponent, SparkleFormFieldComponent } from '@sparkle-ui/core';
import { map } from 'rxjs';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { BackupsState } from '../../core/states/backups.state';

@Component({
  selector: 'app-database',
  imports: [FormsModule, FileTreeComponent, SparkleButtonComponent, SparkleFormFieldComponent],
  templateUrl: './database.component.html',
  styleUrl: './database.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DatabaseComponent {
  #route = inject(ActivatedRoute);
  #backups = inject(BackupsState);
  #firstDBPath = '';

  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
  activeBackup = computed(() => {
    const activeBackup = this.#backups.backups().find((x) => x.Backup?.ID === this.backupId());

    this.#firstDBPath = activeBackup?.Backup?.DBPath ?? '';

    return activeBackup;
  });

  backupFilePath = signal<string>('');

  activeBackupEffect = effect(() => {
    const activeBackup = this.activeBackup();

    if (!activeBackup) return;

    this.backupFilePath.set(activeBackup.Backup?.DBPath ?? '');
  });

  repairDatabase() {
    alert('Not implemented');
  }

  deleteDatabase() {
    alert('Not implemented');
  }

  restoreDatabase() {
    alert('Not implemented');
  }

  resetDatabasePath() {
    this.backupFilePath.set(this.#firstDBPath);
  }

  saveDatabasePath() {
    alert('Not implemented');
  }

  saveAndRepairDatabasePath() {
    alert('Not implemented');
  }

  moveDatabasePath() {
    alert('Not implemented');
  }
}
