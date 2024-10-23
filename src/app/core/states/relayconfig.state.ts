import { Injectable, signal } from '@angular/core';

export type Relayconfig = {
  accessToken: string;
  clientId: string;
};

@Injectable({
  providedIn: 'root',
})
export class RelayconfigState {
  #config = signal<Relayconfig | null>(null);

  config = this.#config.asReadonly();

  parentIframeListner: AbortController | null = null;
  parentOrigin = '*';

  fetchConfig(): void {
    this.#killListener();

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
            return;
          }

          if (typeof parsed['clientId'] !== 'string') {
            this.#sendMessageToParent('error:invalid-config');
            return;
          }

          if (typeof parsed['accessToken'] !== 'string') {
            this.#sendMessageToParent('error:invalid-config');
            return;
          }

          console.info('postMessage config set');
          this.#config.set(parsed as Relayconfig);
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
