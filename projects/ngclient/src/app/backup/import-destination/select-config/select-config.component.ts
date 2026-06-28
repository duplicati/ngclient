import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipChip } from '@ship-ui/core/ship-chip';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import { finalize } from 'rxjs';
import { DuplicatiServer, RestoreTaskConfigElementDto } from '../../../core/openapi';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { RelativeTimePipe } from '../../../core/pipes/relative-time.pipe';
import { BackupDraft, BackupsState } from '../../../core/states/backups.state';
import { getBackendIcon, getBackendType } from '../../destination/destination.config-utilities';
import { ImportDestinationState } from '../import-destination.state';

type ConfigOption = RestoreTaskConfigElementDto & {
  Selected: boolean;
};

@Component({
  selector: 'app-import-destination-select-config',
  imports: [
    ShipButton,
    ShipCard,
    ShipToggle,
    ShipCheckbox,
    FormsModule,
    ShipProgressBar,
    ShipTooltip,
    ShipIcon,
    BytesPipe,
    RelativeTimePipe,
    ShipChip,
    ShipFormField,
  ],
  templateUrl: './select-config.component.html',
  styleUrl: './select-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SelectConfigComponent implements OnInit {
  #importState = inject(ImportDestinationState);
  #dupServer = inject(DuplicatiServer);
  #router = inject(Router);
  #alertService = inject(ShipAlertService);
  #backupsState = inject(BackupsState);

  getBackendType = getBackendType;
  getBackendIcon = getBackendIcon;

  isLoading = signal(true);
  isImporting = signal(false);
  configs = signal<ConfigOption[]>([]);
  saveNow = signal(false);
  importMetadata = signal(false);
  searchTerm = signal('');

  allSelected = computed(() => this.selectedItems().length === this.configs().length);
  noneSelected = computed(() => this.selectedItems().length === 0);
  configsSorted = computed(() => {
    const searchTerm = this.searchTerm().toLowerCase();
    return this.configs()
      .map((c) => ({ ...c, Match: searchTerm ? c.Name?.toLowerCase().includes(searchTerm) : null }))
      .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''))
      .sort((a, b) => (a.Match === b.Match ? 0 : a.Match ? -1 : 1));
  });

  ngOnInit() {
    const id = this.#importState.temporaryBackupId();
    if (!id) {
      this.#router.navigate(['/backup/import-destination/destination']);
      return;
    }

    this.#dupServer
      .postApiV1BackupByIdRestoreTaskConfig({ id })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (result) => {
          const options = result
            .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''))
            .map((item) => ({
              ...item,
              Selected: result.length === 1,
            }));

          this.configs.set(options);
        },
        error: (err) => {
          this.#importState.showErrorDialog(err.message || 'Failed to fetch configurations');
        },
      });
  }

  toggleSelected(id: string | null) {
    this.configs.update((configs) => {
      return configs.map((c) => (c.BackupId === id ? { ...c, Selected: !c.Selected } : c));
    });
  }

  selectAll() {
    this.configs.update((configs) => {
      return configs.map((c) => ({ ...c, Selected: true }));
    });
  }

  selectNone() {
    this.configs.update((configs) => {
      return configs.map((c) => ({ ...c, Selected: false }));
    });
  }

  selectedItems = computed(() => {
    return this.configs().filter((c) => c.Selected);
  });

  import() {
    const selected = this.selectedItems();
    if (selected.length === 0) return;

    const importMetadata = this.importMetadata();
    const isDirect = this.saveNow() || selected.length !== 1;

    this.isImporting.set(true);

    const importNext = (index: number) => {
      if (index >= selected.length) {
        this.isImporting.set(false);
        this.#alertService.success($localize`Successfully imported ${selected.length} backup(s)`);
        this.#router.navigate(['/']);
        return;
      }

      const item = selected[index];

      this.#dupServer
        .postApiV1BackupByIdImportfromtemp({
          requestBody: {
            BackupId: item.BackupId,
            ImportMetadata: importMetadata,
            Direct: isDirect,
          },
        })
        .subscribe({
          next: (res) => {
            if (!isDirect) {
              this.isImporting.set(false);
              const draftId = this.#backupsState.addDraftBackup(res.data as BackupDraft);
              this.#router.navigate(['/backup-draft', draftId]);
            } else {
              this.configs.update((configs) => {
                return configs.filter((c) => c.BackupId !== item.BackupId);
              });
              importNext(index + 1);
            }
          },
          error: (err) => {
            this.isImporting.set(false);
            this.#importState.showErrorDialog(`Failed to import ${item.Name}: ${err.message}`);
          },
        });
    };

    importNext(0);
  }

  back() {
    this.#router.navigate(['/backup/import-destination/encryption']);
  }
}
