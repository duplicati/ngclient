import { inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import {
  ConnectionStringDto,
  ConnectionStrings,
  CreateConnectionStringDto,
  UpdateConnectionStringDto,
} from '../openapi';
import { revertableSignal } from '../signals/revertable-signal';

@Injectable({
  providedIn: 'root',
})
export class ConnectionStringsState {
  #connectionStrings = inject(ConnectionStrings);

  isSaving = signal(false);

  resourceDestinations = rxResource({
    stream: () => this.#connectionStrings.getApiV2ConnectionStrings(),
  });

  destinations = revertableSignal(() => {
    const destinations = this.resourceDestinations.value()?.Data;

    if (!destinations) return [];

    return destinations;
  });

  save(selected: ConnectionStringDto | 'new', data: CreateConnectionStringDto | UpdateConnectionStringDto) {
    this.isSaving.set(true);

    data.Description = '';
    const obs =
      selected === 'new'
        ? this.#connectionStrings.postApiV2ConnectionStrings({ requestBody: data as CreateConnectionStringDto })
        : this.#connectionStrings.putApiV2ConnectionStringById({
            id: selected.ID,
            requestBody: data as UpdateConnectionStringDto,
          });

    return obs.pipe(
      finalize(() => {
        this.isSaving.set(false);
      })
    );
  }

  getById(id: number) {
    return this.#connectionStrings.getApiV2ConnectionStringById({ id });
  }

  delete(id: number) {
    return this.#connectionStrings.deleteApiV2ConnectionStringById({ id });
  }

  reload() {
    this.resourceDestinations.reload();
  }
}
