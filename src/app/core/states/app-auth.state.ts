import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, take, tap } from 'rxjs';
import { AccessTokenOutputDto, DuplicatiServerService } from '../openapi';
import { RelayconfigState } from './relayconfig.state';

export const dummytoken = 'PROXY_AUTHED_FAKE_TOKEN';
const SESSION_STORAGE_ACCESS_TOKEN = 'accessToken';

@Injectable({
  providedIn: 'root',
})
export class AppAuthState {
  #router = inject(Router);
  #http = inject(HttpClient);
  #dupServer = inject(DuplicatiServerService);
  #relayConfigState = inject(RelayconfigState);
  #token = signal<string | null>(sessionStorage.getItem(SESSION_STORAGE_ACCESS_TOKEN));
  #isLoggingOut = signal(false);

  token = this.#token.asReadonly();
  isLoggingOut = this.#isLoggingOut.asReadonly();

  login(pass: string, rememberMe: boolean) {
    return this.#dupServer
      .postApiV1AuthLogin({
        requestBody: {
          Password: pass,
          RememberMe: rememberMe,
        },
      })
      .pipe(
        take(1),
        tap((res) => { 
          if (res.AccessToken) {
            this.#token.set(res.AccessToken);
            if (rememberMe)
              sessionStorage.setItem(SESSION_STORAGE_ACCESS_TOKEN, res.AccessToken || '');
          } else {
            this.#token.set(null);
            sessionStorage.removeItem(SESSION_STORAGE_ACCESS_TOKEN);
          }
        })
      );
  }

  refreshToken() {
    // In relay mode, the requests are proxied and authenticated by the client
    if (this.#relayConfigState.relayIsEnabled()) {
      this.#token.set(dummytoken);

      return new Observable<AccessTokenOutputDto>((observer) => {
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

  clearSessionToken() {
    sessionStorage.removeItem(SESSION_STORAGE_ACCESS_TOKEN);
  }

  logout() {
    this.#isLoggingOut.set(true);
    sessionStorage.removeItem(SESSION_STORAGE_ACCESS_TOKEN);

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
