import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, take, tap } from 'rxjs';
import { AccessTokenOutputDto, DuplicatiServerService, PostApiV1AuthRefreshData } from '../openapi';
import { RelayconfigState } from './relayconfig.state';

export const dummytoken = 'PROXY_AUTHED_FAKE_TOKEN';
const SESSION_STORAGE_REFRESH_NONCE_KEY = 'refreshNonce';
const LOCAL_STORAGE_REFRESH_NONCE_KEY = 'v1:persist:duplicati:refreshNonce';

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

  private getRefreshNonceBody(): { body: PostApiV1AuthRefreshData | undefined, local: boolean } {
    // Prefer session storage for nonce, if present
    // Note that the local storage is for persistent login and is shared across tabs, so we cannot cache it in a signal
    const sessionStoredNonce = sessionStorage.getItem(SESSION_STORAGE_REFRESH_NONCE_KEY);
    const localStoredNonce = localStorage.getItem(LOCAL_STORAGE_REFRESH_NONCE_KEY);
    const storedNonce = sessionStoredNonce || localStoredNonce;
    const body = storedNonce ? { requestBody: { Nonce: storedNonce } } : undefined;
    return { body, local: storedNonce === localStoredNonce };
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

    const { body, local } = this.getRefreshNonceBody();
    return this.#dupServer.postApiV1AuthRefresh(body).pipe(
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
    const { body, local } = this.getRefreshNonceBody();

    sessionStorage.removeItem(SESSION_STORAGE_REFRESH_NONCE_KEY);
    if (local)
      localStorage.removeItem(LOCAL_STORAGE_REFRESH_NONCE_KEY);

    this.#dupServer
      .postApiV1AuthRefreshLogout(body)
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
