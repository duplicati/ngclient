import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ShipCard, ShipChip } from '@ship-ui/core';
import { DestinationTypeOption } from '../../../core/states/destinationconfig.state';

@Component({
  selector: 'app-destination-list-item',
  imports: [ShipCard, ShipChip],
  templateUrl: './destination-list-item.component.html',
  styleUrl: './destination-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationListItemComponent {
  destination = input.required<DestinationTypeOption>();
}
