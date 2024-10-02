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

  setConfig(config: Relayconfig) {
    this.#config.set(config);
  }

  clearConfig() {
    this.#config.set(null);
  }
}
