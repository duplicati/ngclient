import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ShipCardComponent } from '@ship-ui/core';
import { DestinationTypeOption } from '../../../core/states/destinationconfig.state';

@Component({
  selector: 'app-destination-list-item',
  imports: [ShipCardComponent],
  templateUrl: './destination-list-item.component.html',
  styleUrl: './destination-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationListItemComponent {
  destination = input.required<DestinationTypeOption>();
}
