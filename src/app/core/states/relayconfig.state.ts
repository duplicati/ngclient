import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export type Relayconfig = {
  accessToken: string;
  clientId: string;
};

@Injectable({
  providedIn: 'root',
})
export class RelayconfigState {
  #config = signal<Relayconfig | null>(null);
  #relayIsEnabled = signal(false);
  #isInIframe = window.self !== window.top;

  relayIsEnabled = this.#relayIsEnabled.asReadonly();
  config = this.#config.asReadonly();
  configLoaded = this.#isInIframe ? new Subject<boolean>() : null;
  isLoading = signal(this.#isInIframe);

  parentIframeListner: AbortController | null = null;
  parentOrigin = '*';

  fetchConfig(): void {
    this.#killListener();

    if (!this.#isInIframe) return;

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

          console.info('postMessage config set');

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
