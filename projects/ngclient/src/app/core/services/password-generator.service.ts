import { Injectable } from '@angular/core';
import { getRandomValues } from '../functions/crypto';

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
    return Array.apply(null, { length: length } as any)
      .map(() => {
        let result;
        while (true) {
          result = String.fromCharCode(getRandomValues());

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
}
