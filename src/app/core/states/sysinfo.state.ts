import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize, Observable, tap } from 'rxjs';
import { DuplicatiServerService, SystemInfoDto } from '../openapi';

type FilterGroups = {
  FilterGroups: {
    [key: string]: string[];
  };
};
@Injectable({
  providedIn: 'root',
})
export class SysinfoState {
  #dupServer = inject(DuplicatiServerService);

  isLoaded = signal(false);
  systemInfo = signal<SystemInfoDto | null>(null);

  filterGroups = toSignal(this.#dupServer.getApiV1SysteminfoFiltergroups() as Observable<FilterGroups>);

  backendModules = computed(() => {
    return this.systemInfo()?.BackendModules ?? [];
  });

  preload(returnObservable = false): Observable<SystemInfoDto> | void {
    const obs = this.#dupServer.getApiV1Systeminfo().pipe(
      tap((x) => this.systemInfo.set(x)),
      // tap((x) => console.log('systemInfo', x)),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }
}
