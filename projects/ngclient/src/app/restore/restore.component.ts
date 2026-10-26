import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipDivider } from '@ship-ui/core/ship-divider';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { defer } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { BackupAndScheduleOutputDto, DuplicatiServer } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';

@Component({
  selector: 'app-restore',
  imports: [
    FormsModule,
    StatusBarComponent,
    ShipCard,
    ShipButton,
    ShipDivider,
    ShipFormField,
    ShipIcon,
    ShipProgressBar,
    RouterLink,
  ],
  templateUrl: './restore.component.html',
  styleUrl: './restore.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreComponent {
  #backupsState = inject(BackupsState);
  #dupServer = inject(DuplicatiServer);

  backups = computed(() => this.#backupsState.backups().filter((job) => job.Backup?.OperationType !== 'Sync'));
  backupsLoading = this.#backupsState.backupsLoading;
  searchTerm = signal('');
  showSearch = computed(() => this.backups().length > 3);
  filteredBackups = computed(() => {
    const backups = this.backups();
    const searchTerm = this.searchTerm().trim().toLowerCase();
    if (!this.showSearch() || !searchTerm) return backups;

    return backups.filter((x) => x.Backup?.Name?.toLowerCase().includes(searchTerm));
  });

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  restoreNow(backup: BackupAndScheduleOutputDto) {
    defer(() =>
      this.#dupServer.postApiV1BackupByIdRestore({
        path: { id: backup.Backup?.ID! },
        body: {
          // paths?: Array<(string)> | null;
          // passphrase?: (string) | null;
          // time?: (string) | null;
          // restore_path?: (string) | null;
          // overwrite?: (boolean) | null;
          // permissions?: (boolean) | null;
          // skip_metadata?: (boolean) | null;
        },
      })
    );
  }
}
