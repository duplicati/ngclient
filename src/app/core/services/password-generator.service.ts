import { Injectable } from '@angular/core';

const DEFAULT_PASSWORD_PATTERN = /[a-zA-Z0-9_\-\+\.]/;

@Injectable({
  providedIn: 'root',
})
export class PasswordGeneratorService {
  generate(length: number, pattern = DEFAULT_PASSWORD_PATTERN) {
    const _self = this;

    return Array.apply(null, { length: length } as any)
      .map(() => {
        let result;
        while (true) {
          result = String.fromCharCode(_self.#getRandomByte());

          if (pattern.test(result)) {
            return result;
          }
        }
      }, this)
      .join('');
  }

  #getRandomByte() {
    if (window.crypto && window.crypto.getRandomValues) {
      const result = new Uint8Array(1);
      window.crypto.getRandomValues(result);
      return result[0];
    } else if ((window as any).msCrypto && (window as any).msCrypto.getRandomValues) {
      const result = new Uint8Array(1);
      (window as any).msCrypto.getRandomValues(result);
      return result[0];
    } else {
      return Math.floor(Math.random() * 256);
    }
  }
}
