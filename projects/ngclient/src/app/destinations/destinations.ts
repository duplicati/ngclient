import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ShipButton,
  ShipCard,
  ShipDialogService,
  ShipDivider,
  ShipFormField,
  ShipIcon,
  ShipProgressBar,
} from '@ship-ui/core';
import { DestinationListItemComponent } from '../backup/destination/destination-list-item/destination-list-item.component';
import { DestinationListComponent } from '../backup/destination/destination-list/destination-list.component';
import {
  getConfigurationByKey,
  getConfigurationByUrl,
  getSimplePath,
} from '../backup/destination/destination.config-utilities';
import { SingleDestinationComponent } from '../backup/destination/single-destination/single-destination.component';
import { TestState, TestUrl } from '../backup/source-data/target-url-dialog/test-url/test-url';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { ConnectionStringDto } from '../core/openapi';
import { TestDestinationService } from '../core/services/test-destination.service';
import { BackupsState } from '../core/states/backups.state';
import { ConnectionStringsState } from '../core/states/connection-strings.state';

@Component({
  selector: 'app-destinations',
  imports: [
    DestinationListItemComponent,
    DestinationListComponent,
    SingleDestinationComponent,
    StatusBarComponent,
    ShipProgressBar,
    ShipButton,
    ShipIcon,
    ShipCard,
    ShipFormField,
    ShipDivider,
    TestUrl,
    FormsModule,
  ],
  templateUrl: './destinations.html',
  styleUrl: './destinations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Destinations {
  #connectionStringsState = inject(ConnectionStringsState);
  #backupsState = inject(BackupsState);
  #testDestination = inject(TestDestinationService);
  #dialog = inject(ShipDialogService);
  getSimplePath = getSimplePath;
  backups = this.#backupsState.backups;

  constructor() {
    this.#backupsState.getBackups();
  }

  isSaving = this.#connectionStringsState.isSaving;
  destinations = this.#connectionStringsState.destinations;
  isLoading = this.#connectionStringsState.resourceDestinations.isLoading;
  testUrl = viewChild(TestUrl);

  selectedDestination = signal<ConnectionStringDto | 'new' | null>(null);
  selectedDestinationId = computed(() =>
    this.selectedDestination() !== 'new' ? (this.selectedDestination() as ConnectionStringDto).ID : null
  );

  editName = signal<string | null>(null);
  editDescription = signal<string | null>(null);
  editBaseUrl = signal<string | null>(null);
  initialBaseUrl = signal<string | null>(null);

  isUrlChanged = computed(() => {
    const editUrl = this.editBaseUrl();
    const initialUrl = this.initialBaseUrl();

    if (this.selectedDestination() === 'new') return true;
    return editUrl !== initialUrl;
  });

  testSignal = signal<TestState | null>(null);
  testResponse = computed(() => {
    const testState = this.testSignal();

    if (testState && typeof testState !== 'string') {
      return testState;
    }

    return null;
  });

  getOutOfSyncBackupIds(option: ConnectionStringDto) {
    if (!option.Backups) return [];

    const backupsMap = new Map(this.backups().map((b) => [b.Backup?.ID, b.Backup]));
    return option.Backups.filter((cb) => {
      const backup = backupsMap.get(cb.ID);
      return backup && backup.TargetURL !== option.BaseUrl;
    })
      .map((cb) => cb.ID)
      .filter((id): id is string => !!id);
  }

  isOutOfSync(option: ConnectionStringDto) {
    return this.getOutOfSyncBackupIds(option).length > 0;
  }

  #resetTestOnUrlChange = effect(() => {
    this.editBaseUrl();
    this.testSignal.set(null);
  });

  selectDestination(dest: ConnectionStringDto | 'new') {
    this.selectedDestination.set(dest);
    this.testSignal.set(null);

    if (dest === 'new') {
      this.editName.set(null);
      this.editDescription.set(null);
      this.editBaseUrl.set(null);
      this.initialBaseUrl.set(null);
    } else {
      this.editName.set(dest.Name);
      this.editDescription.set(dest.Description);
      this.editBaseUrl.set(dest.BaseUrl);
      this.initialBaseUrl.set(dest.BaseUrl);

      this.#connectionStringsState.getById(dest.ID).subscribe((res) => {
        if (res.Data) {
          this.editName.set(res.Data.Name);
          this.editDescription.set(res.Data.Description);
          this.editBaseUrl.set(res.Data.BaseUrl ?? null);
          this.initialBaseUrl.set(res.Data.BaseUrl ?? null);
        }
      });
    }
  }

  cancelEdit() {
    this.selectedDestination.set(null);
  }

  setDestination(key: string) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default('');
      this.editBaseUrl.set(defaultUrl);
      return;
    }

    this.editBaseUrl.set(`${key}://`);
  }

  removeDestination() {
    this.editBaseUrl.set(null);
  }

  async testDestination() {
    const res = await this.testUrl()?.testDestination(false);
    if (res?.action === 'missing-folder') {
      this.promptCreateFolder();
    }
  }

  promptCreateFolder() {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Folder missing`,
        message: $localize`The specified folder does not exist. Would you like to create it now?`,
        confirmText: $localize`Create Folder`,
        cancelText: $localize`Dismiss`,
      },
      closed: (res) => {
        if (res) {
          this.testUrl()?.createFolder();
        }
      },
    });
  }

  save() {
    const selected = this.selectedDestination();
    if (!selected) return;

    this.performSave(selected);
  }

  private performSave(selected: ConnectionStringDto | 'new') {
    let name = this.editName();
    let description = this.editDescription();
    const baseUrl = this.editBaseUrl();

    if (selected === 'new') {
      const config = getConfigurationByUrl(baseUrl ?? '');
      const typeName = config?.displayName ?? 'Destination';
      const existingCount = this.destinations().filter((d) => d.Name?.startsWith(typeName)).length;

      name = `${typeName} #${existingCount + 1}`;
      description = null;
    }

    const requestBody = {
      Name: name,
      Description: description,
      BaseUrl: baseUrl,
    };

    this.#connectionStringsState.save(selected, requestBody).subscribe(() => {
      this.selectedDestination.set(null);
      this.#connectionStringsState.reload();
      this.#backupsState.getBackups(true);
    });
  }

  updateBackupsSync(option: ConnectionStringDto, event: Event) {
    event.stopPropagation();

    const outOfSyncIds = this.getOutOfSyncBackupIds(option);

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Update backups`,
        message: $localize`Are you sure you want to update ${outOfSyncIds.length} backup(s) to use the current connection string?`,
        confirmText: $localize`Update`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (res) {
          this.#connectionStringsState.updateBackups(option.ID, outOfSyncIds).subscribe(() => {
            this.#connectionStringsState.reload();
            this.#backupsState.getBackups(true);
          });
        }
      },
    });
  }

  deleteDestination(id: number, event: Event) {
    event.stopPropagation();

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Delete destination`,
        message: $localize`Are you sure you want to delete this destination?`,
        confirmText: $localize`Delete`,
        confirmVariant: 'error',
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (res) {
          this.#connectionStringsState.delete(id).subscribe(() => {
            this.#connectionStringsState.reload();
          });
        }
      },
    });
  }
}
