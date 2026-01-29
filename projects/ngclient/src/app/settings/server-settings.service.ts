import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs';
import { DuplicatiServer, GetApiV1ServersettingsResponse } from '../core/openapi';
import { ServerStateService } from '../core/services/server-state.service';
import { ServerStatusWebSocketService } from '../core/services/server-status-websocket.service';

const SHOWN_WELCOME_PAGE_KEY = 'shown-welcome-page-v1';
const HIDE_CONSOLE_CONNECTION_STATUS_KEY = 'hide-console-connection-status';
const DISABLE_CONSOLE_CONTROL_KEY = 'disable-console-control';
const DISABLE_TRAYICON_LOGIN_KEY = 'disable-tray-icon-login';
const REMOTE_ACCESS_INTERFACE_KEY = 'server-listen-interface';
const REMOTE_ACCESS_ALLOWED_HOSTNAMES_KEY = 'allowed-hostnames';
const REMOTE_ACCESS_PASSWORD = 'server-passphrase';
const UPDATE_CHANNEL_KEY = 'update-channel';
const STARTUP_DELAY_KEY = 'startup-delay';
const USAGE_REPORTER_LEVEL_KEY = 'usage-reporter-level';
const POWER_MODE_PROVIDER_KEY = 'power-mode-provider';

@Injectable({
  providedIn: 'root',
})
export class ServerSettingsService {
  #dupServer = inject(DuplicatiServer);
  #wsService = inject(ServerStatusWebSocketService);
  #serverState = inject(ServerStateService);

  #initialServerSettings = toSignal(this.#dupServer.getApiV1Serversettings());
  #serverSettings = signal<GetApiV1ServersettingsResponse | undefined>(undefined);

  serverSettings = computed(() => this.#serverSettings() || this.#initialServerSettings());

  #updateFromWs = effect(() => {
    const settings = this.#wsService.serverSettings();
    if (settings) this.#serverSettings.set(settings);
  });

  constructor() {
    this.#wsService.subscribe('serversettings');
  }

  isConsoleConnectionStatusHidden = computed(() => {
    const settings = this.serverSettings();
    if (!settings) return false;
    return settings[HIDE_CONSOLE_CONNECTION_STATUS_KEY] === 'True';
  });

  refreshServerSettings() {
    // If we have websocket connection, do not refresh via REST
    if (this.#serverState.getConnectionMethod() === 'websocket') return;

    this.#dupServer.getApiV1Serversettings().subscribe({
      next: (res) => {
        this.#serverSettings.set(res);
      },
    });
  }

  #patchObjectWithSettings(settings: GetApiV1ServersettingsResponse, update: { [key: string]: string | null }) {
    var res = { ...settings };
    for (const [key, value] of Object.entries(update)) {
      if (value === null) {
        delete res[key];
      } else {
        res[key] = value;
      }
    }
    return res;
  }

  patchServerSettings(settings: { [key: string]: string | null }) {
    // Keep a copy of previous settings to revert on error
    const prevsettings = { ...this.serverSettings() };

    // Optimistically update the signal
    this.#serverSettings.set(
      this.#patchObjectWithSettings(this.serverSettings() ?? <GetApiV1ServersettingsResponse>{}, settings)
    );

    return this.#dupServer.patchApiV1Serversettings({ requestBody: settings }).pipe(
      catchError((err) => {
        // Revert on error
        this.#serverSettings.set(prevsettings);
        throw err;
      })
    );
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
    return this.patchServerSetting(HIDE_CONSOLE_CONNECTION_STATUS_KEY, hide ? 'True' : 'False');
  }

  setDisableTrayIconLogin(disable: boolean) {
    return this.patchServerSetting(DISABLE_TRAYICON_LOGIN_KEY, disable ? 'True' : 'False');
  }

  setDisableConsoleControl(disable: boolean) {
    return this.patchServerSetting(DISABLE_CONSOLE_CONTROL_KEY, disable ? 'True' : 'False');
  }

  setRemoteAccessInterface(interfaceStr: string) {
    return this.patchServerSetting(REMOTE_ACCESS_INTERFACE_KEY, interfaceStr);
  }

  setRemoteAccessAllowedHostnames(hostnames: string) {
    var settings: { [key: string]: string | null } = {
      [REMOTE_ACCESS_ALLOWED_HOSTNAMES_KEY]: hostnames,
    };
    if (this.serverSettings()?.[REMOTE_ACCESS_INTERFACE_KEY] === 'loopback') {
      settings[REMOTE_ACCESS_INTERFACE_KEY] = 'any';
    }
    return this.patchServerSettings(settings);
  }

  setRemoteAccessPassword(password: string) {
    return this.patchServerSetting(REMOTE_ACCESS_PASSWORD, password);
  }

  setUpdateChannel(channel: string) {
    return this.patchServerSetting(UPDATE_CHANNEL_KEY, channel);
  }

  setStartupDelay(delay: string) {
    return this.patchServerSetting(STARTUP_DELAY_KEY, delay);
  }

  setUsageReporterLevel(level: string) {
    return this.patchServerSetting(USAGE_REPORTER_LEVEL_KEY, level);
  }

  setPowerModeProvider(provider: string) {
    return this.patchServerSetting(POWER_MODE_PROVIDER_KEY, provider);
  }
}
