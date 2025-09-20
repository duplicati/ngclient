import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButtonComponent, ShipFormFieldComponent, ShipIconComponent } from '@ship-ui/core';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { DestinationListItemComponent } from '../destination-list-item/destination-list-item.component';

@Component({
  selector: 'app-destination-list',
  imports: [DestinationListItemComponent, FormsModule, ShipFormFieldComponent, ShipButtonComponent, ShipIconComponent],
  templateUrl: './destination-list.component.html',
  styleUrl: './destination-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationListComponent {
  #destinationState = inject(DestinationConfigState);

  setDestination = output<string>();

  destinationSearchTerm = signal('');
  destinationTypeOptions = this.#destinationState.destinationTypeOptions;

  destinationTypeOptionsFocused = computed(() => {
    const options = this.destinationTypeOptions();
    const searchTerm = this.destinationSearchTerm().toLowerCase();

    const sortedOptions = [...options].sort((a, b) => {
      const sortOrderA = a.sortOrder ?? 0;
      const sortOrderB = b.sortOrder ?? 0;

      if (sortOrderA !== sortOrderB) {
        return sortOrderB - sortOrderA;
      }

      return a.displayName.localeCompare(b.displayName);
    })
    // Remove hidden options
    .filter((option) => (option.sortOrder ?? 0) >= 0);

    if (searchTerm) {
      return sortedOptions.filter((option) => option.searchTerms.toLowerCase().includes(searchTerm));
    }

    return sortedOptions;
  });
}
