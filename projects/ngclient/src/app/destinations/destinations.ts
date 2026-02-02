import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ShipIcon } from '@ship-ui/core';
import { finalize } from 'rxjs';
import { DestinationListItemComponent } from '../backup/destination/destination-list-item/destination-list-item.component';
import { ConnectionStrings } from '../core/openapi';
import { revertableSignal } from '../core/signals/revertable-signal';

@Component({
  selector: 'app-destinations',
  imports: [DestinationListItemComponent, ShipIcon],
  templateUrl: './destinations.html',
  styleUrl: './destinations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Destinations {
  #connectionStrings = inject(ConnectionStrings);

  isCreating = signal(false);

  resourceDestinations = rxResource({
    stream: () => this.#connectionStrings.getApiV2ConnectionStrings(),
  });

  destinations = revertableSignal(() => {
    const destinations = this.resourceDestinations.value()?.Data;

    if (!destinations) return [];

    return destinations;
  });

  createConnectionString(connectionString: string) {
    this.isCreating.set(true);

    this.#connectionStrings
      .postApiV2ConnectionStrings({
        requestBody: {
          Name: null,
          Description: null,
          BaseUrl: connectionString,
        },
      })
      .pipe(finalize(() => this.isCreating.set(false)))
      .subscribe();
  }
}
