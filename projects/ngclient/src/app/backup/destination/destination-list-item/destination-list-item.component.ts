import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ShipCard, ShipCardVariant, ShipChip } from '@ship-ui/core';
import { ConnectionStringsState } from '../../../core/states/connection-strings.state';
import { DestinationTypeOption } from '../../../core/states/destinationconfig.state';
import { getConfigurationByUrl, getSimplePath } from '../destination.config-utilities';

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
  variant = input<ShipCardVariant>('type-b');
  connectionStringId = input<number | null>();

  #connectionStringState = inject(ConnectionStringsState);

  connectionString = computed(() => {
    const id = this.connectionStringId();
    if (id === null || id === undefined) return null;
    return this.#connectionStringState.destinations().find((x) => x.ID === id);
  });

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

  getSimplePath(url: string | null | undefined) {
    if (!url) return '';
    return getSimplePath(url);
  }
}
