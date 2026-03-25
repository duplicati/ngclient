import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { ShipDialogService } from '@ship-ui/core';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, RemoteControlStatusOutput } from '../../core/openapi';
import { WINDOW } from '../../core/providers/window';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../server-settings.service';

type State =
  | 'connected'
  | 'connecting'
  | 'registered'
  | 'registering'
  | 'registeringfaulted'
  | 'disabled'
  | 'inactive'
  | 'unknown';

type Timeout = ReturnType<typeof setTimeout>;

@Injectable({
  providedIn: 'root',
})
export class RemoteControlState {
  #window = inject(WINDOW);
  #dialog = inject(ShipDialogService);
  #dupServer = inject(DuplicatiServer);
  #sysinfo = inject(SysinfoState);
  #serverSettings = inject(ServerSettingsService);

  repeatRegisterTimer: Timeout | null = null;
  #errorRetryTimer: Timeout | null = null;
  #errorRetryCount = 0;
  readonly #maxErrorRetries = 5;
  readonly #baseRetryDelayMs = 2000;
  state = signal<State>('unknown');
  claimUrl = signal<string | null>(null);
  registerUrl = signal<string>('');
  customRegisterUrl = signal<string>('');
  status = computed(() => {
    const state = this.state();

    if (state === 'connecting') return $localize`Console connection is enabled but not connected`;
    if (state === 'connected') return $localize`Connected to console`;
    if (state === 'registering') return $localize`Registering machine...`;
    if (state === 'registeringfaulted') return $localize`Registration failed`;
    if (state === 'registered') return $localize`Registered, waiting for accept`;
    if (state === 'disabled') return $localize`Console connection is configured but not enabled`;
    if (state === 'unknown') return $localize`...loading...`;

    return $localize`Console connection is not set up`;
  });

  sysInfoEffect = effect(() => {
    const systemInfo = this.#sysinfo.systemInfo();

    if (!systemInfo) return;

    this.registerUrl.set(systemInfo.RemoteControlRegistrationUrl ?? '');
  });

  #mapRemoteControlStatus(data: RemoteControlStatusOutput) {
    // Reset error retry count on successful response
    this.#errorRetryCount = 0;

    data.RegistrationUrl && this.claimUrl.set(data.RegistrationUrl);

    if (data.IsConnected) {
      this.state.set('connected');
    } else if (data.IsEnabled) {
      this.state.set('connecting');
    } else if (data.CanEnable) {
      this.state.set('disabled');
    } else if (data.IsRegisteringFaulted) {
      this.state.set('registeringfaulted');
    } else if (data.IsRegistering) {
      if (data.RegistrationUrl != null && data.RegistrationUrl.trim().length > 0) {
        this.state.set('registered');
      } else {
        this.state.set('registering');
      }
    } else {
      this.state.set('inactive');
    }

    const currentState = this.state();

    // Stop any existing timer
    if (this.repeatRegisterTimer !== null) {
      clearTimeout(this.repeatRegisterTimer);
      this.repeatRegisterTimer = null;
    }

    // If we are registering, we need to keep checking until the registration is claimed
    if (currentState === 'registering') {
      this.repeatRegisterTimer = setTimeout(() => {
        this.#dupServer.postApiV1RemotecontrolRegisterWait().subscribe({
          next: (res) => this.#mapRemoteControlStatus(res),
          error: (err) => this.#mapRemoteControlError(err),
        });
      }, 5000);
    }

    // If we are enabled, poll to see if we become connected
    // If we are registered, poll to see if we become disabled
    if (currentState === 'connecting' || currentState === 'registered') {
      this.repeatRegisterTimer = setTimeout(() => {
        this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
          next: (res) => this.#mapRemoteControlStatus(res),
          error: (err) => this.#mapRemoteControlError(err),
        });
      }, 5000);
    }

    if (data.IsRegistering && data.CanEnable) {
      this.#dupServer.deleteApiV1RemotecontrolRegister().subscribe({
        next: (res) => this.#mapRemoteControlStatus(res),
      });
    }
  }

  #mapRemoteControlError(_data: any) {
    // Clear any existing error retry timer
    if (this.#errorRetryTimer !== null) {
      clearTimeout(this.#errorRetryTimer);
      this.#errorRetryTimer = null;
    }

    // Stop retrying after max attempts to avoid infinite request loops
    if (this.#errorRetryCount >= this.#maxErrorRetries) {
      this.state.set('registeringfaulted');
      this.#errorRetryCount = 0;
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const delay = this.#baseRetryDelayMs * Math.pow(2, this.#errorRetryCount);
    this.#errorRetryCount++;

    this.#errorRetryTimer = setTimeout(() => {
      this.#errorRetryTimer = null;
      this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
        next: (res) => this.#mapRemoteControlStatus(res),
        error: (err) => this.#mapRemoteControlError(err),
      });
    }, delay);
  }

  refreshRemoteControlStatus() {
    this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
      next: (res) => this.#mapRemoteControlStatus(res),
      error: (err) => this.#mapRemoteControlError(err),
    });
  }

  beginRemoteRegistration(useCustomUrl = false) {
    this.state.set('registering');

    this.#dupServer
      .postApiV1RemotecontrolRegister({
        requestBody: { RegistrationUrl: useCustomUrl ? this.customRegisterUrl() : this.registerUrl() },
      })
      .subscribe({
        next: (res) => this.#mapRemoteControlStatus(res),
        error: (err) => this.#mapRemoteControlError(err),
      });
  }

  cancelRemoteRegistration() {
    this.#dupServer.deleteApiV1RemotecontrolRegister().subscribe({
      next: (res) => this.#mapRemoteControlStatus(res),
      error: (err) => this.#mapRemoteControlError(err),
    });
  }

  enableRemoteControl() {
    this.#dupServer.postApiV1RemotecontrolEnable().subscribe({
      next: (res) => this.#mapRemoteControlStatus(res),
      error: (err) => this.#mapRemoteControlError(err),
    });
  }

  disableRemoteControl() {
    this.#dupServer.postApiV1RemotecontrolDisable().subscribe({
      next: (res) => this.#mapRemoteControlStatus(res),
      error: (err) => this.#mapRemoteControlError(err),
    });
  }

  deleteRemoteControl() {
    const _self = this;

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm delete`,
        message: $localize`Are you sure you want to delete the console registration?`,
        confirmText: $localize`Delete registration`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        _self.#dupServer.deleteApiV1RemotecontrolRegistration().subscribe({
          next: (res) => _self.#mapRemoteControlStatus(res),
          error: (err) => _self.#mapRemoteControlError(err),
        });
      },
    });
  }

  openConsole(defaultPath = '/app/machines', queryParams?: Record<string, string>) {
    const settings = this.#serverSettings.serverSettings();
    const systemInfo = this.#sysinfo.systemInfo();

    let url = 'https://app.duplicati.com';
    let sysInfoDefault = systemInfo?.RemoteControlDashboardUrl ?? '';

    if (sysInfoDefault.length > 0) url = sysInfoDefault;
    if (settings && settings['remote-control-dashboard-url']) url = settings['remote-control-dashboard-url'];

    const urlObj = new URL(url);

    url = urlObj.origin + defaultPath;

    if (queryParams) {
      const query = new URLSearchParams(queryParams);
      url += `?${query.toString()}`;
    }

    this.#window.open(url, '_blank');
  }
}
