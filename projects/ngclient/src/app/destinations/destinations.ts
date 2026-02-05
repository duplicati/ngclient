import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipAlert, ShipButton, ShipCard, ShipFormField, ShipIcon, ShipList, ShipProgressBar } from '@ship-ui/core';
import { TestState } from '../backup/backup.state';
import { DestinationListItemComponent } from '../backup/destination/destination-list-item/destination-list-item.component';
import { DestinationListComponent } from '../backup/destination/destination-list/destination-list.component';
import { getConfigurationByKey, getConfigurationByUrl } from '../backup/destination/destination.config-utilities';
import { SingleDestinationComponent } from '../backup/destination/single-destination/single-destination.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { ConnectionStringDto } from '../core/openapi';
import { TestDestinationService } from '../core/services/test-destination.service';
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
    ShipAlert,
    ShipList,
    ShipFormField,
    FormsModule,
  ],
  templateUrl: './destinations.html',
  styleUrl: './destinations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Destinations {
  #connectionStringsState = inject(ConnectionStringsState);
  #testDestination = inject(TestDestinationService);

  isSaving = this.#connectionStringsState.isSaving;
  destinations = this.#connectionStringsState.destinations;
  isLoading = this.#connectionStringsState.resourceDestinations.isLoading;

  selectedDestination = signal<ConnectionStringDto | 'new' | null>(null);

  editName = signal<string | null>(null);
  editDescription = signal<string | null>(null);
  editBaseUrl = signal<string | null>(null);

  testSignal = signal<TestState>('');
  testErrorMessage = signal<string | null>(null);

  #resetTestOnUrlChange = effect(() => {
    this.editBaseUrl();
    this.testSignal.set('');
    this.testErrorMessage.set(null);
  });

  selectDestination(dest: ConnectionStringDto | 'new') {
    this.selectedDestination.set(dest);
    this.testSignal.set('');
    this.testErrorMessage.set(null);

    if (dest === 'new') {
      this.editName.set(null);
      this.editDescription.set(null);
      this.editBaseUrl.set(null);
    } else {
      this.editName.set(dest.Name);
      this.editDescription.set(dest.Description);
      this.editBaseUrl.set(dest.BaseUrl);
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

  testDestination() {
    const targetUrl = this.editBaseUrl();
    if (!targetUrl) return;

    this.testSignal.set('testing');

    this.#testDestination.testDestination(targetUrl, null, 0, true, 'Backend', true).subscribe({
      next: (res) => {
        if (res.action === 'success') {
          this.testSignal.set('success');
          return;
        }

        this.testSignal.set('error');
        this.testErrorMessage.set(res.errorMessage ?? $localize`An error occurred while testing the destination.`);

        const targetUrlHasParams = targetUrl.includes('?');
        if (res.action === 'trust-cert') {
          this.editBaseUrl.set(
            targetUrl + `${targetUrlHasParams ? '&' : '?'}accept-specified-ssl-hash=${res.certData}`
          );
        }

        if (res.action === 'approve-host-key') {
          this.editBaseUrl.set(targetUrl + `${targetUrlHasParams ? '&' : '?'}ssh-fingerprint=${res.reportedHostKey}`);
        }

        if (res.testAgain) this.testDestination();
      },
    });
  }

  save() {
    const selected = this.selectedDestination();
    if (!selected) return;

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
    });
  }

  deleteDestination(id: number, event: Event) {
    event.stopPropagation();

    if (!confirm($localize`Are you sure you want to delete this destination?`)) return;

    this.#connectionStringsState.delete(id).subscribe(() => {
      this.#connectionStringsState.reload();
    });
  }
}
