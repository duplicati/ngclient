import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';
import { DuplicatiServer, GetApiV1ServersettingsResponse } from '../core/openapi';

const SHOWN_WELCOME_PAGE_KEY = 'shown-welcome-page-v1';
const HIDE_CONSOLE_CONNECTION_STATUS_KEY = 'hide-console-connection-status';

@Injectable({
  providedIn: 'root',
})
export class ServerSettingsService {
  #dupServer = inject(DuplicatiServer);

  #initialServerSettings = toSignal(this.#dupServer.getApiV1Serversettings());
  #serverSettings = signal<GetApiV1ServersettingsResponse | undefined>(undefined);
  serverSettings = computed(() => this.#serverSettings() || this.#initialServerSettings());

  isConsoleConnectionStatusHidden = computed(() => {
    const settings = this.serverSettings();
    if (!settings) return false;
    return settings[HIDE_CONSOLE_CONNECTION_STATUS_KEY] === 'True';
  });

  refreshServerSettings() {
    this.#dupServer.getApiV1Serversettings().subscribe({
      next: (res) => {
        this.#serverSettings.set(res);
      },
    });
  }

  patchServerSettings(settings: { [key: string]: string | null }) {
    return this.#dupServer.patchApiV1Serversettings({ requestBody: settings });
  }

  patchServerSetting(key: string, value: string | null) {
    const setting: { [key: string]: string | null } = {};
    setting[key] = value;
    return this.patchServerSettings(setting);
  }

  setShownWelcomePage() {
    return this.patchServerSetting(SHOWN_WELCOME_PAGE_KEY, 'true');
  }

  setHideConsoleConnectionStatus(hide: boolean) {
    return this.patchServerSetting(HIDE_CONSOLE_CONNECTION_STATUS_KEY, hide ? 'True' : 'False').pipe(
      tap(() =>
        this.#serverSettings.set({
          ...this.serverSettings(),
          [HIDE_CONSOLE_CONNECTION_STATUS_KEY]: hide ? 'True' : 'False',
        })
      )
    );
  }
}
