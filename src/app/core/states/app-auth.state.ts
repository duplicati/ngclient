import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, take, tap } from 'rxjs';
import { DuplicatiServerService } from '../openapi';

@Injectable({
  providedIn: 'root',
})
export class AppAuthState {
  #router = inject(Router);
  #dupServer = inject(DuplicatiServerService);
  #token = signal<string | null>(null);
  #isLoggingOut = signal(false);

  token = this.#token.asReadonly();
  isLoggingOut = this.#isLoggingOut.asReadonly();

  login(pass: string) {
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
        finalize(() => {
          this.#isLoggingOut.set(false);
          this.#token.set(null);
          this.#router.navigate(['/login']);
        })
      )
      .subscribe();
  }
}
