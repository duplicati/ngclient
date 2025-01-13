import { computed, inject, Injectable, signal } from '@angular/core';
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

  filterGroups = signal<FilterGroups | null>(null);
  backendModules = computed(() => {
    return this.systemInfo()?.BackendModules ?? [];
  });

  preload(returnObservable = false): Observable<SystemInfoDto> | void {
    const obs = (this.#dupServer.getApiV1Systeminfo() as Observable<SystemInfoDto>).pipe(
      tap((systemInfo) => {
        this.systemInfo.set(systemInfo);
      }),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }

  preloadFilterGroups(returnObservable = false): Observable<FilterGroups> | void {
    const obs = (this.#dupServer.getApiV1SysteminfoFiltergroups() as Observable<FilterGroups>).pipe(
      tap((filterGroups) => {
        this.filterGroups.set(filterGroups);
      }),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }
}
