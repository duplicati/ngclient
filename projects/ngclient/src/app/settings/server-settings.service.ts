import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DuplicatiServer, GetApiV1ServersettingsResponse } from '../core/openapi';
@Injectable({
  providedIn: 'root',
})
export class ServerSettingsService {
  #dupServer = inject(DuplicatiServer);

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
}
