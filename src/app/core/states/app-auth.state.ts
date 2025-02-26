import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, take, tap } from 'rxjs';
import { AccessTokenOutput, DuplicatiServerService } from '../openapi';
import { RelayconfigState } from './relayconfig.state';

export const dummytoken = 'PROXY_AUTHED_FAKE_TOKEN';

@Injectable({
  providedIn: 'root',
})
export class AppAuthState {
  #router = inject(Router);
  #http = inject(HttpClient);
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
        tap((res) => res.AccessToken && this.#token.set(res.AccessToken))
      );
  }

  refreshToken() {
    // In relay mode, the requests are proxied and authenticated by the client
    if (this.#relayConfigState.relayIsEnabled()) {
      this.#token.set(dummytoken);

      return new Observable<AccessTokenOutput>((observer) => {
        observer.next({ AccessToken: dummytoken });
        observer.complete();
      });
    }

    return this.#dupServer.postApiV1AuthRefresh().pipe(
      take(1),
      tap((res) => res.AccessToken && this.#token.set(res.AccessToken))
    );
  }

  checkProxyAuthed() {
    const headers = new HttpHeaders({
      'custom-proxy-check': 'true',
    });

    return this.#http
      .get('/api/v1/systeminfo', {
        headers,
      })
      .pipe(
        map(() => {
          this.#token.set(dummytoken);

          return true;
        }),
        catchError(() => {
          return of(false);
        })
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
