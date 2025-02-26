import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { DuplicatiServerService, RemoteControlStatusOutput } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';

type State =
  | 'connected'
  | 'registered'
  | 'registering'
  | 'registeringfaulted'
  | 'enabled'
  | 'disabled'
  | 'inactive'
  | 'unknown';

type Timeout = ReturnType<typeof setTimeout>;

@Injectable({
  providedIn: 'root',
})
export class RemoteControlState {
  #dupServer = inject(DuplicatiServerService);
  #sysinfo = inject(SysinfoState);

  repeatRegisterTimer: Timeout | null = null;
  state = signal<State>('unknown');
  claimUrl = signal<string | null>(null);
  registerUrl = signal<string>('');
  status = computed(() => {
    const state = this.state();

    if (state === 'enabled') return 'Remote control is enabled but not connected';
    if (state === 'connected') return 'Remote control is connected';
    if (state === 'registering') return 'Registering machine...';
    if (state === 'registeringfaulted') return 'Registration failed';
    if (state === 'registered') return 'Registered, waiting for accept';
    if (state === 'disabled') return 'Remote control is configured but not enabled';
    if (state === 'unknown') return '...loading...';

    return 'Remote control is not set up';
  });

  sysInfoEffect = effect(() => {
    const systemInfo = this.#sysinfo.systemInfo();

    if (!systemInfo) return;

    this.registerUrl.set(systemInfo.RemoteControlRegistrationUrl ?? '');
  });

  #mapRemoteControlStatus(data: RemoteControlStatusOutput) {
    // remoteControlEnabled = data.IsEnabled;
    // remoteControlCanEnable = data.CanEnable;
    // remoteControlConnected = data.IsConnected;
    // remoteControlIsRegistering = data.IsRegistering;
    // remoteControlIsRegisteringFaulted = data.IsRegisteringFaulted;
    // remoteControlIsRegisteringCompleted = data.IsRegisteringCompleted;

    data.RegistrationUrl && this.claimUrl.set(data.RegistrationUrl);

    if (data.IsConnected) {
      this.state.set('connected');
    } else if (data.IsEnabled) {
      this.state.set('enabled');
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
        this.#dupServer.postApiV1RemotecontrolRegister({ requestBody: { RegistrationUrl: '' } }).subscribe({
          next: (res) => this.#mapRemoteControlStatus(res),
          error: (err) => this.#mapRemoteControlError(err),
        });

        // AppService.post('/remotecontrol/register', { RegistrationUrl: '' }).then(
        //   function (data) {
        //     this.#mapRemoteControlStatus(data.data);
        //   },
        //   () => {
        //     AppService.get('/remotecontrol/status').then(
        //       function (data) {
        //         this.#mapRemoteControlStatus(data.data);
        //       },
        //       () => {}
        //     );
        //   }
        // );
      }, 5000);
    }

    // If we are enabled, poll to see if we become connected
    // If we are registered, poll to see if we become disabled
    if (currentState === 'enabled' || currentState === 'registered') {
      this.repeatRegisterTimer = setTimeout(() => {
        this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
          next: (res) => this.#mapRemoteControlStatus(res),
          error: (err) => this.#mapRemoteControlError(err),
        });
      }, 5000);
    }

    // If we can enable and are registering, there must be a lingering registration
    if (data.IsRegistering && data.CanEnable) {
      this.#dupServer.deleteApiV1RemotecontrolRegister().subscribe({
        next: (res) => this.#mapRemoteControlStatus(res),
      });
    }
  }

  #mapRemoteControlError(data: any) {
    // AppUtils.connectionError(data);

    this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
      next: (res) => this.#mapRemoteControlStatus(res),
    });
  }

  refreshRemoteControlStatus() {
    this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
      next: (res) => this.#mapRemoteControlStatus(res),
      error: (err) => this.#mapRemoteControlError(err),
    });
  }

  beginRemoteRegistration() {
    this.state.set('registering');

    this.#dupServer.postApiV1RemotecontrolRegister({ requestBody: { RegistrationUrl: this.registerUrl() } }).subscribe({
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

    if (confirm('Are you sure you want to delete the remote control registration?')) {
      _self.#dupServer.deleteApiV1RemotecontrolRegistration().subscribe({
        next: (res) => _self.#mapRemoteControlStatus(res),
        error: (err) => _self.#mapRemoteControlError(err),
      });
    }
  }
}
