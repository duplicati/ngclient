import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, Observable, take, tap } from 'rxjs';
import { AccessTokenOutput, DuplicatiServerService } from '../openapi';
import { RelayconfigState } from './relayconfig.state';

const dummytoken = 'dummytoken';

@Injectable({
  providedIn: 'root',
})
export class AppAuthState {
  #router = inject(Router);
  #dupServer = inject(DuplicatiServerService);
  #relayConfigState = inject(RelayconfigState);
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
    // In relay mode, the requests are proxied and authenticated by the client
    // TODO: This should be fixed by probing the API, as we can be
    // pre-authenticated if running behind a proxy
    if (this.#relayConfigState.relayIsEnabled()) {
      this.#token.set(dummytoken);

      return new Observable<AccessTokenOutput>((observer) => {
        observer.next({ AccessToken: dummytoken });
        observer.complete();
      });
    }

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
