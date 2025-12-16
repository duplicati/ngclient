import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, take, tap } from 'rxjs';
import { AccessTokenOutputDto, DuplicatiServer, PostApiV1AuthRefreshData } from '../openapi';
import { OpenAPI } from '../openapi/core/OpenAPI';
import { RelayconfigState } from './relayconfig.state';

export const dummytoken = 'PROXY_AUTHED_FAKE_TOKEN';
const SESSION_STORAGE_REFRESH_NONCE_KEY = 'refreshNonce';
const LOCAL_STORAGE_REFRESH_NONCE_KEY = 'v1:persist:duplicati:refreshNonce';

type AuthResponse = {
  authorized: boolean;
  message?: string;
  socketToken?: string;
};

@Injectable({
  providedIn: 'root',
})
export class AppAuthState {
  #router = inject(Router);
  #http = inject(HttpClient);
  #dupServer = inject(DuplicatiServer);
  #relayConfigState = inject(RelayconfigState);
  #token = signal<string | null>(null);
  #isLoggingOut = signal(false);
  #isProxyAuthed = signal(false);

  token = this.#token.asReadonly();
  isLoggingOut = this.#isLoggingOut.asReadonly();

  private setRefreshNonce(nonce: string | null | undefined, persist: boolean) {
    if (!nonce) {
      sessionStorage.removeItem(SESSION_STORAGE_REFRESH_NONCE_KEY);
      return;
    }

    if (persist) {
      localStorage.setItem(LOCAL_STORAGE_REFRESH_NONCE_KEY, nonce || '');
    } else {
      sessionStorage.setItem(SESSION_STORAGE_REFRESH_NONCE_KEY, nonce || '');
    }
  }

  private getRefreshNonceBody(): { requestBody: PostApiV1AuthRefreshData | undefined; local: boolean } {
    // Prefer session storage for nonce, if present
    // Note that the local storage is for persistent login and is shared across tabs, so we cannot cache it in a signal
    const sessionStoredNonce = sessionStorage.getItem(SESSION_STORAGE_REFRESH_NONCE_KEY);
    const localStoredNonce = localStorage.getItem(LOCAL_STORAGE_REFRESH_NONCE_KEY);
    const storedNonce = sessionStoredNonce || localStoredNonce;
    const body = storedNonce ? { requestBody: { Nonce: storedNonce } } : undefined;
    return { requestBody: body, local: storedNonce === localStoredNonce };
  }

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
            this.setRefreshNonce(res.RefreshNonce, rememberMe);
          } else {
            this.#token.set(null);
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

    // If we are authenticated via proxy, we just need a websocket token
    if (this.#isProxyAuthed()) {
      return this.#dupServer
        .postApiV1AuthIssuetokenByOperation({
          operation: 'websocket',
        })
        .pipe(
          take(1),
          tap((res) => {
            if (res.Token) {
              this.#token.set(res.Token);
            }
          }),
          map((res) => {
            return <AccessTokenOutputDto>{ AccessToken: res.Token };
          })
        );
    }

    const { requestBody, local } = this.getRefreshNonceBody();
    return this.#dupServer.postApiV1AuthRefresh(requestBody).pipe(
      take(1),
      tap((res) => {
        if (res.AccessToken) {
          this.#token.set(res.AccessToken);
          this.setRefreshNonce(res.RefreshNonce, local);
        }
      })
    );
  }

  checkProxyAuthed() {
    const headers = new HttpHeaders({
      'custom-proxy-check': 'true',
    });

    const prefix = OpenAPI.BASE || '';

    return this.#http
      .post(`${prefix}/api/v1/auth/status`, {
        headers,
      })
      .pipe(
        map((_res) => {
          const res = _res as AuthResponse;
          if (res?.authorized && res?.socketToken) {
            this.#token.set(res.socketToken);
            this.#isProxyAuthed.set(true);
            return true;
          }

          return false;
        }),
        catchError(() => {
          return of(false);
        })
      );
  }

  logout() {
    this.#isLoggingOut.set(true);
    const { requestBody, local } = this.getRefreshNonceBody();

    sessionStorage.removeItem(SESSION_STORAGE_REFRESH_NONCE_KEY);
    if (local) localStorage.removeItem(LOCAL_STORAGE_REFRESH_NONCE_KEY);

    this.#dupServer
      .postApiV1AuthRefreshLogout(requestBody)
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
