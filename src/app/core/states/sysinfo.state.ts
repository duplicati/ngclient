import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, tap } from 'rxjs';
import { DuplicatiServerService, SystemInfoDto } from '../openapi';

@Injectable({
  providedIn: 'root',
})
export class SysinfoState {
  #dupServer = inject(DuplicatiServerService);

  isLoaded = signal(false);
  systemInfo = signal<SystemInfoDto | null>(null);

  backendModules = computed(() => {
    return this.systemInfo()?.BackendModules ?? [];
  });

  preload(returnObservable = false): Observable<SystemInfoDto> | void {
    const obs = this.#dupServer.getApiV1Systeminfo().pipe(
      tap((x) => this.systemInfo.set(x)),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }
}
