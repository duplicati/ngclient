import { effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, take, tap } from 'rxjs';
import { DuplicatiServerService } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';

@Injectable({
  providedIn: 'root',
})
export class AppAuthState {
  #ls = inject(LOCALSTORAGE);
  #router = inject(Router);
  #dupServer = inject(DuplicatiServerService);
  #token = signal<string | null>(this.#ls.getItemParsed<string>('token') ?? null);
  #tokenSetTime = signal<number | null>(this.#ls.getItemParsed<number>('tokenSetTime') ?? null);
  #isLoggingOut = signal(false);

  tokenSetTime = this.#tokenSetTime.asReadonly();
  token = this.#token.asReadonly();
  isLoggingOut = this.#isLoggingOut.asReadonly();

  #tokenEffect = effect(() => {
    if (!this.#token()) {
      this.#ls.clearAll();
      this.#router.navigate(['/login']);
      return;
    }
    const now = Date.now();
    this.#ls.setItemParsed('tokenSetTime', now);
    this.#ls.setItemParsed('token', this.#token());
    this.#tokenSetTime.set(this.#token() ? now : null);
  });

  login(pass = 'helloworld') {
    return this.#dupServer
      .postApiV1AuthLogin({
        requestBody: {
          Password: pass,
          RememberMe: true,
        },
      })
      .pipe(
        take(1),
        tap((res) => this.#token.set(res.AccessToken ?? null))
      );
  }

  refreshToken() {
    return this.#dupServer.postApiV1AuthRefresh().pipe(
      take(1),
      tap((res) => this.#token.set(res.AccessToken ?? null))
    );
  }

  logout() {
    this.#isLoggingOut.set(true);

    this.#dupServer
      .postApiV1AuthRefreshLogout()
      .pipe(
        take(1),
        finalize(() => this.#isLoggingOut.set(false)),
        tap((_) => {
          this.#token.set(null);
          this.#ls.clearAll();
          this.#router.navigate(['/login']);
        })
      )
      .subscribe({
        error: (_) => {
          this.#token.set(null);
          this.#ls.clearAll();
          this.#router.navigate(['/login']);
        },
      });
  }
}
