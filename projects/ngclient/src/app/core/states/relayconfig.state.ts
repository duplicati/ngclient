import { inject, Injectable, signal } from '@angular/core';
import { ReplaySubject } from 'rxjs';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { isRelaySupportEnabled } from '../utils/proxy-config.util';

export type Relayconfig = {
  accessToken: string;
  clientId: string;
  locale: string;
};

@Injectable({
  providedIn: 'root',
})
export class RelayconfigState {
  #ls = inject(LOCALSTORAGE);
  #config = signal<Relayconfig | null>(null);
  #useRelay = window.self !== window.top && isRelaySupportEnabled();
  #relayIsEnabled = signal(this.#useRelay);

  relayIsEnabled = this.#relayIsEnabled.asReadonly();
  config = this.#config.asReadonly();
  configLoaded = this.#useRelay ? new ReplaySubject<boolean>() : null;
  isLoading = signal(this.#useRelay);

  parentIframeListner: AbortController | null = null;
  parentOrigin = '*';

  fetchConfig(): void {
    this.#killListener();

    if (!this.#useRelay) return;

    this.#relayIsEnabled.set(true);
    this.parentIframeListner = new AbortController();
    this.#sendMessageToParent('connected');

    window.addEventListener<any>(
      'message',
      (event: MessageEvent) => {
        if (event.data.startsWith('access:')) {
          const data = event.data.replace('access:', '');
          const parsed = JSON.parse(data) as { [key: string]: unknown };

          if (!parsed?.['accessToken'] || !parsed?.['clientId']) {
            this.#sendMessageToParent('error:invalid-config');
            this.#relayIsEnabled.set(false);
            return;
          }

          if (typeof parsed['clientId'] !== 'string') {
            this.#sendMessageToParent('error:invalid-config');
            this.#relayIsEnabled.set(false);
            return;
          }

          if (typeof parsed['accessToken'] !== 'string') {
            this.#sendMessageToParent('error:invalid-config');
            this.#relayIsEnabled.set(false);
            return;
          }

          const currentLocale = this.#ls.getItem('locale') ?? 'en-US';
          const newLocale = (parsed['locale'] as string) ?? 'en-US';

          if (currentLocale !== newLocale) {
            this.#ls.setItem('locale', newLocale);
            window.location.reload();
          }

          this.#config.set(parsed as Relayconfig);
          this.configLoaded?.next(true);
          this.isLoading.set(false);
          this.#sendMessageToParent('handshake-complete');
        }
      },
      {
        signal: this.parentIframeListner.signal,
      }
    );
  }

  #sendMessageToParent(message: string) {
    window.parent.postMessage(message, '*');
  }

  #killListener() {
    if (this.parentIframeListner) {
      this.parentIframeListner.abort();
      this.parentIframeListner = null;
    }
  }

  setConfig(config: Relayconfig) {
    this.#config.set(config);
  }

  clearConfig() {
    this.#config.set(null);
  }
}
