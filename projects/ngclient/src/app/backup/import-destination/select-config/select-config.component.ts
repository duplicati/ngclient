import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ShipAlertService,
  ShipButton,
  ShipCard,
  ShipCheckbox,
  ShipIcon,
  ShipProgressBar,
  ShipToggle,
  ShipTooltip,
} from '@ship-ui/core';
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

  saveNowTooltip = computed(() => {
    if (this.canChooseSaveNow()) return 'Save backups without editing the configuration';
    return 'Save now can only be disabled when importing a single backup';
  });

  canChooseSaveNow = computed(() => this.selectedItems().length === 1);

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
              Selected: true,
            }));

          this.configs.set(options);

          if (options.length === 1) {
            this.saveNow.set(false); // Can be checked or unchecked by user
          } else {
            this.saveNow.set(true); // Forced true if multiple
          }
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
