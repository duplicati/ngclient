import { inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { defer, finalize } from 'rxjs';
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
    stream: () => defer(() => this.#connectionStrings.getApiV2ConnectionStrings()),
  });

  destinations = revertableSignal(() => {
    const destinations = this.resourceDestinations.value()?.Data;

    if (!destinations) return [];

    return destinations;
  });

  save(selected: ConnectionStringDto | 'new', data: CreateConnectionStringDto | UpdateConnectionStringDto) {
    this.isSaving.set(true);

    data.Description = '';
    const obs = defer(() =>
      selected === 'new'
        ? this.#connectionStrings.postApiV2ConnectionStrings({ body: data as CreateConnectionStringDto })
        : this.#connectionStrings.putApiV2ConnectionStringById({
            path: { id: selected.ID },
            body: data as UpdateConnectionStringDto,
          })
    );

    return obs.pipe(
      finalize(() => {
        this.isSaving.set(false);
      })
    );
  }

  getById(id: number) {
    return defer(() => this.#connectionStrings.getApiV2ConnectionStringById({ path: { id } }));
  }

  delete(id: number) {
    return defer(() => this.#connectionStrings.deleteApiV2ConnectionStringById({ path: { id } }));
  }

  reload() {
    this.resourceDestinations.reload();
  }

  updateBackups(id: number, backupIds: string[]) {
    return defer(() =>
      this.#connectionStrings.postApiV2ConnectionStringByIdUpdateBackups({
        path: { id },
        body: { BackupIDs: backupIds },
      })
    );
  }
}
