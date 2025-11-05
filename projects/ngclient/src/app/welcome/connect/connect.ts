import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ShipAlert, ShipButton, ShipCard, ShipFormField, ShipIcon, ShipProgressBar } from '@ship-ui/core';
import { WINDOW } from '../../core/providers/window';
import { RemoteControlState } from '../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../settings/server-settings.service';

@Component({
  selector: 'app-connect',
  imports: [FormsModule, ShipFormField, ShipButton, ShipProgressBar, ShipCard, ShipAlert, ShipIcon],
  templateUrl: './connect.html',
  styleUrl: './connect.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Connect {
  #router = inject(Router);
  #window = inject(WINDOW);
  #remoteControlState = inject(RemoteControlState);
  #serverSettingsService = inject(ServerSettingsService);

  isOldOpen = signal(false);
  typeParam = input.required<'logon' | 'link'>();

  // state = signal('connected');
  state = this.#remoteControlState.state;
  claimUrl = this.#remoteControlState.claimUrl;
  registerUrl = this.#remoteControlState.registerUrl;
  customRegisterUrl = this.#remoteControlState.customRegisterUrl;
  additionalReportingUrl = computed(() => {
    const settings = this.#serverSettingsService.serverSettings();
    if (this.#remoteControlState.state() === 'inactive') return '';
    return settings ? settings['additional-report-url'] || '' : '';
  });

  copiedReportingUrl = signal(false);
  customRegisterUrlValid = computed(() => {
    const url = this.customRegisterUrl();
    const urlRegex = /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/;

    if (url.length === 0) return false;
    if (!urlRegex.test(url)) return false;
    return true;
  });

  registeringCounter = signal<number | null>(null);
  didTry = signal(false);
  stateEffect = effect(() => {
    const registerUrl = this.#remoteControlState.registerUrl();
    const state = this.state();
    const typeParam = this.typeParam();
    const counter = this.registeringCounter();

    if (state === 'inactive' && typeParam === 'logon' && registerUrl !== '') {
      if (!this.didTry()) {
        this.#remoteControlState.beginRemoteRegistration();
        this.didTry.set(true);
      }
    }

    if (state === 'registering') {
      if (counter === null) {
        this.registeringCounter.set(0);
      }

      setTimeout(() => {
        this.registeringCounter.set((counter ?? 0) + 1);
      }, 1000);
    } else {
      this.registeringCounter.set(null);
    }

    if (state === 'connected' || state === 'disabled' || state === 'connecting') {
      this.#router.navigate(['']);
    }
  });

  ngOnInit() {
    this.#remoteControlState.refreshRemoteControlStatus();
  }

  finishConnection() {
    const claimUrl = this.#remoteControlState.claimUrl()!;

    this.#window.open(claimUrl, '_blank');
  }

  registerViaCustomUrl() {
    this.#remoteControlState.beginRemoteRegistration(true);
  }

  retryWhenFaulted() {
    this.#remoteControlState.cancelRemoteRegistration();
    this.customRegisterUrl.set('');

    if (this.typeParam() === 'logon') {
      this.#router.navigate(['/welcome/select']);
    }
  }

  // Old below

  cancel() {
    this.#remoteControlState.cancelRemoteRegistration();
  }

  register() {
    this.#remoteControlState.beginRemoteRegistration();
  }

  disable() {
    this.#remoteControlState.disableRemoteControl();
  }

  enable() {
    this.#remoteControlState.enableRemoteControl();
  }

  delete() {
    this.#remoteControlState.deleteRemoteControl();
  }

  copyReportingUrl() {
    const url = this.additionalReportingUrl();
    if (url) {
      this.copiedReportingUrl.set(true);
      setTimeout(() => this.copiedReportingUrl.set(false), 2000);
      navigator.clipboard.writeText(url);
    }
  }
}
