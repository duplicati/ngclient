import { Injectable } from '@angular/core';

const DEFAULT_PASSWORD_PATTERN = /[a-zA-Z0-9_\-\+\.!@#$%^&*?_~()-]/;

@Injectable({
  providedIn: 'root',
})
export class PasswordGeneratorService {
  generate(length: number, pattern = DEFAULT_PASSWORD_PATTERN) {
    let password;
    do {
      password = this.generatePassword(length, pattern);
    } while (this.calculatePasswordStrength(password) < 5);

    return password;
  }

  generatePassword(length: number, pattern = DEFAULT_PASSWORD_PATTERN) {
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

  calculatePasswordStrength(password: string) {
    let strength = 1;

    if (password.length >= 8) {
      strength++;
    }

    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) {
      strength++;
    }

    if (password.match(/\d+/)) {
      strength++;
    }

    if (password.match(/.[!,@,#,$,%,^,&,*,?,_,~,(,),-]/)) {
      strength++;
    }

    return Math.min(strength, 5);
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
