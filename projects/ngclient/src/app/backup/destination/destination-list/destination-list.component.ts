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
  destinationTypeOptionsInFocus = signal(['file', 'ssh', 's3', 'gcs', 'googledrive', 'azure']);
  destinationTypeOptions = this.#destinationState.destinationTypeOptions;

  destinationTypeOptionsFocused = computed(() => {
    const focusedKeys = new Set(this.destinationTypeOptionsInFocus());
    const options = this.destinationTypeOptions();
    const searchTerm = this.destinationSearchTerm().toLowerCase();

    const sortedOptions = [...options].sort((a, b) => {
      const aIsFocused = focusedKeys.has(a.key);
      const bIsFocused = focusedKeys.has(b.key);

      if (aIsFocused && !bIsFocused) return -1;
      if (!aIsFocused && bIsFocused) return 1;
      return 0;
    });

    if (searchTerm) {
      return sortedOptions.filter((option) => option.searchterms.toLowerCase().includes(searchTerm));
    }

    return sortedOptions;
  });
}
