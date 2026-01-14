import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ShipCard, ShipChip } from '@ship-ui/core';
import { DestinationTypeOption } from '../../../core/states/destinationconfig.state';
import { getConfigurationByUrl } from '../destination.config-utilities';

@Component({
  selector: 'app-destination-list-item',
  imports: [ShipCard, ShipChip],
  templateUrl: './destination-list-item.component.html',
  styleUrl: './destination-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationListItemComponent {
  destination = input<DestinationTypeOption>();
  targetUrl = input<string | null>();

  selectedDestinationType = computed(() => {
    const targetUrl = this.targetUrl();

    if (!targetUrl) return null;

    return getConfigurationByUrl(targetUrl) ?? null;
  });

  destinationFromTargetUrl = computed(() => {
    const x = this.selectedDestinationType();
    return x
      ? ({
          key: x.customKey ?? x.key,
          customKey: x.customKey ?? null,
          displayName: x.displayName,
          description: x.description,
          icon: x.icon,
        } as DestinationTypeOption)
      : null;
  });

  destinationItem = computed(() => {
    const destination = this.destination();
    const destinationFromTargetUrl = this.destinationFromTargetUrl();
    return destination || destinationFromTargetUrl || null;
  });
}
