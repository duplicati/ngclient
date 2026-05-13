import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton, ShipFormField, ShipIcon, ShipToggle } from '@ship-ui/core';
import { RemoteDestinationType } from '../../../core/openapi';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { DestinationListItemComponent } from '../destination-list-item/destination-list-item.component';

@Component({
  selector: 'app-destination-list',
  imports: [DestinationListItemComponent, FormsModule, ShipFormField, ShipButton, ShipIcon, ShipToggle],
  templateUrl: './destination-list.component.html',
  styleUrl: './destination-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationListComponent {
  #destinationState = inject(DestinationConfigState);
  #sysinfo = inject(SysinfoState);

  showAsSources = input<boolean>(false);
  moduleType = input<RemoteDestinationType>('Backend');
  setDestination = output<string>();

  destinationSearchTerm = signal('');
  showAllDestinations = signal(false);

  destinationTypeOptions = computed(() => {
    const type = this.moduleType();
    switch (type) {
      case 'SourceProvider':
        return this.#destinationState.sourceProviderOptions();
      case 'RestoreDestinationProvider':
        return this.#destinationState.restoreDestinationOptions();
      case 'Backend':
      default:
        return this.#destinationState.backendDestinationOptions();
    }
  });

  destinationTypeOptionsFocused = computed(() => {
    const knownBackends = this.#sysinfo.backendModules();
    // Patch sortOrder based on deprecation and untested flags
    const options = this.destinationTypeOptions().map((item) => {
      const b = knownBackends.find((x) => x.Key == item.key);

      if (b) item = { ...item, sortOrder: b.IsDeprecated ? -1 : b.IsUntested ? -3 : item.sortOrder };
      return item;
    });

    const searchTerm = this.destinationSearchTerm().toLowerCase();
    const showAll = this.showAllDestinations();

    const sortedOptions = [...options]
      .sort((a, b) => {
        const sortOrderA = a.sortOrder ?? 0;
        const sortOrderB = b.sortOrder ?? 0;

        if (sortOrderA !== sortOrderB) {
          return sortOrderB - sortOrderA;
        }

        return a.displayName.localeCompare(b.displayName);
      })
      // Remove hidden options
      .filter((option) => {
        if (showAll) return true;

        const sortOrder = option.sortOrder ?? 0;
        // Show on direct match even if hidden
        if (sortOrder < 0 && searchTerm?.length) {
          if (option.key.toLocaleLowerCase() === searchTerm.toLocaleLowerCase()) return true;
          if (option.customKey?.toLocaleLowerCase() === searchTerm.toLocaleLowerCase()) return true;
        }
        return sortOrder >= 0;
      });

    // const sortedOptions = options.filter((option) => (option.sortOrder ?? 0) >= 0);

    if (searchTerm) {
      return sortedOptions.filter((option) => option.searchTerms.toLowerCase().includes(searchTerm));
    }

    return sortedOptions;
  });
}
