import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ShipAlert, ShipButton, ShipCard, ShipFormField, ShipIcon, ShipProgressBar } from '@ship-ui/core';
import { WINDOW } from '../../core/providers/window';
import { RemoteControlState } from '../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../settings/server-settings.service';

@Component({
  selector: 'app-connect',
  imports: [RouterLink, FormsModule, ShipFormField, ShipButton, ShipProgressBar, ShipCard, ShipAlert, ShipIcon],
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
  didTry = false;
  triedFinishConnection = false;
  #counterTimer: ReturnType<typeof setTimeout> | null = null;
  #destroyRef = inject(DestroyRef);

  constructor() {
    // Clean up timer when component is destroyed
    this.#destroyRef.onDestroy(() => {
      this.#stopCounterTick();
    });
  }

  stateEffect = effect(() => {
    const registerUrl = this.#remoteControlState.registerUrl();
    const state = this.state();
    const typeParam = this.typeParam();

    if (state === 'inactive' && typeParam === 'logon' && registerUrl !== '') {
      if (!this.didTry) {
        this.didTry = true;
        // Schedule asynchronously to avoid synchronous signal write
        // (beginRemoteRegistration sets state to 'registering' which would
        // re-trigger this effect synchronously, causing an infinite loop)
        queueMicrotask(() => this.#remoteControlState.beginRemoteRegistration());
      }
    }

    if (state === 'registered') {
      if (!this.triedFinishConnection) {
        const claimUrl = untracked(() => this.claimUrl());
        if (claimUrl !== null) {
          this.triedFinishConnection = true;
          this.#finishConnection();
        }
      }
    }

    if (state === 'registering') {
      // Start the counter tick loop (untracked to avoid re-triggering this effect)
      untracked(() => {
        if (this.registeringCounter() === null) {
          this.registeringCounter.set(0);
        }
        this.#startCounterTick();
      });
    } else {
      // Clear timer and reset counter when leaving 'registering' state
      this.#stopCounterTick();
      untracked(() => this.registeringCounter.set(null));
    }

    if (state === 'connected' || state === 'disabled' || state === 'connecting') {
      // Schedule asynchronously to avoid synchronous signal writes
      // from patchServerSettings during change detection
      queueMicrotask(() => {
        this.#serverSettingsService.setShownWelcomePage().subscribe(() => {
          this.#router.navigate(['']);
        });
      });
    }
  });

  #startCounterTick() {
    // Clear any existing timer to prevent accumulation
    if (this.#counterTimer !== null) {
      clearTimeout(this.#counterTimer);
    }

    this.#counterTimer = setTimeout(() => {
      this.#counterTimer = null;
      const current = this.registeringCounter() ?? 0;
      this.registeringCounter.set(current + 1);
      // Continue ticking as long as we're still in 'registering' state
      if (this.state() === 'registering') {
        this.#startCounterTick();
      }
    }, 1000);
  }

  #stopCounterTick() {
    if (this.#counterTimer !== null) {
      clearTimeout(this.#counterTimer);
      this.#counterTimer = null;
    }
  }

  ngOnInit() {
    this.#remoteControlState.refreshRemoteControlStatus();
  }

  #finishConnection() {
    const claimUrl = this.#remoteControlState.claimUrl()!;

    this.#window.open(`${claimUrl}?closeAfterConnection=true`, '_blank');
  }

  registerViaCustomUrl() {
    this.#remoteControlState.beginRemoteRegistration(true);
  }

  retryWhenFaulted() {
    this.#remoteControlState.cancelRemoteRegistration();
    this.customRegisterUrl.set('');
    this.didTry = false;
    this.triedFinishConnection = false;

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
