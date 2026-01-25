import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton, ShipFormField, ShipIcon } from '@ship-ui/core';
import { RemoteDestinationType } from '../../../core/openapi';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { DestinationListItemComponent } from '../destination-list-item/destination-list-item.component';

@Component({
  selector: 'app-destination-list',
  imports: [DestinationListItemComponent, FormsModule, ShipFormField, ShipButton, ShipIcon],
  templateUrl: './destination-list.component.html',
  styleUrl: './destination-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationListComponent {
  #destinationState = inject(DestinationConfigState);

  showAsSources = input<boolean>(false);
  moduleType = input<RemoteDestinationType>('Backend');
  setDestination = output<string>();

  destinationSearchTerm = signal('');

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
    const options = this.destinationTypeOptions();
    const searchTerm = this.destinationSearchTerm().toLowerCase();

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
