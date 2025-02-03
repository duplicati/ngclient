import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DuplicatiServerService, GetApiV1ServersettingsResponse } from '../core/openapi';
import { finalize, pipe } from 'rxjs';
@Injectable({
  providedIn: 'root',
})
export class ServerSettingsService {
  #dupServer = inject(DuplicatiServerService);

  #initialServerSettings = toSignal(this.#dupServer.getApiV1Serversettings());
  #serverSettings = signal<GetApiV1ServersettingsResponse | undefined>(undefined);
  serverSettings = computed(() => this.#serverSettings() || this.#initialServerSettings());

  refreshServerSettings() {
    this.#dupServer.getApiV1Serversettings().subscribe({
      next: (res) => {
        this.#serverSettings.set(res);
      },
    });
  }
  
  withRefresh() {
    return pipe(
      finalize(() => this.refreshServerSettings())
    );
  }
}
