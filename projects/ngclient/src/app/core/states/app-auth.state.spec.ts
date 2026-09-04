import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenOutputDto, DuplicatiServer } from '../openapi';
import { client } from '../openapi/client.gen';
import { AppAuthState, dummytoken } from './app-auth.state';
import { RelayconfigState } from './relayconfig.state';

const SESSION_NONCE_KEY = 'refreshNonce';
const PERSISTENT_NONCE_KEY = 'v1:persist:duplicati:refreshNonce';

describe('AppAuthState', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    client.setConfig({ baseUrl: '', headers: {} });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    client.setConfig({ baseUrl: '', headers: {} });
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  const setup = (relayIsEnabled = false) => {
    const logoutResponse = new Subject<unknown>();
    const server = {
      postApiV1AuthLogin: vi.fn(() => of({})),
      postApiV1AuthRefresh: vi.fn(() => of({})),
      postApiV1AuthIssuetokenByOperation: vi.fn(() => of({})),
      postApiV1AuthRefreshLogout: vi.fn(() => logoutResponse),
    };
    const http = {
      post: vi.fn((..._args: unknown[]) => of({ authorized: false })),
    };
    const router = {
      navigate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AppAuthState,
        { provide: DuplicatiServer, useValue: server },
        { provide: HttpClient, useValue: http },
        { provide: Router, useValue: router },
        { provide: RelayconfigState, useValue: { relayIsEnabled: vi.fn(() => relayIsEnabled) } },
      ],
    });

    const state = TestBed.inject(AppAuthState);
    return { state, server, http, router, logoutResponse };
  };

  it.each([
    { rememberMe: false, storage: sessionStorage, otherStorage: localStorage, key: SESSION_NONCE_KEY },
    { rememberMe: true, storage: localStorage, otherStorage: sessionStorage, key: PERSISTENT_NONCE_KEY },
  ])('stores the login nonce in the selected storage when rememberMe is $rememberMe', async (testCase) => {
    const { state, server } = setup();
    server.postApiV1AuthLogin.mockReturnValue(of({ AccessToken: 'access-token', RefreshNonce: 'refresh-nonce' }));

    await firstValueFrom(state.login('secret', testCase.rememberMe));

    expect(server.postApiV1AuthLogin).toHaveBeenCalledWith({
      body: { Password: 'secret', RememberMe: testCase.rememberMe },
    });
    expect(state.token()).toBe('access-token');
    expect(testCase.storage.getItem(testCase.key)).toBe('refresh-nonce');
    expect(testCase.otherStorage.length).toBe(0);
  });

  it('keeps the token unset when login returns no access token', async () => {
    const { state, server } = setup();
    server.postApiV1AuthLogin.mockReturnValue(of({ RefreshNonce: 'unused-nonce' }));

    await firstValueFrom(state.login('secret', false));

    expect(state.token()).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('prefers the session nonce and falls back to the persistent nonce', () => {
    const { state } = setup();

    sessionStorage.setItem(SESSION_NONCE_KEY, 'session-nonce');
    localStorage.setItem(PERSISTENT_NONCE_KEY, 'persistent-nonce');

    expect(state.getRefreshNonceBody()).toEqual({
      requestBody: { Nonce: 'session-nonce' },
      local: false,
    });

    sessionStorage.removeItem(SESSION_NONCE_KEY);

    expect(state.getRefreshNonceBody()).toEqual({
      requestBody: { Nonce: 'persistent-nonce' },
      local: true,
    });
  });

  it('shares one refresh request between concurrent subscribers and updates the session nonce', async () => {
    const { state, server } = setup();
    const response = new Subject<AccessTokenOutputDto>();
    sessionStorage.setItem(SESSION_NONCE_KEY, 'old-session-nonce');
    server.postApiV1AuthRefresh.mockReturnValue(response);

    const first = firstValueFrom(state.refreshToken());
    const second = firstValueFrom(state.refreshToken());

    expect(server.postApiV1AuthRefresh).toHaveBeenCalledTimes(1);
    expect(server.postApiV1AuthRefresh).toHaveBeenCalledWith({
      body: { Nonce: 'old-session-nonce' },
    });

    response.next({ AccessToken: 'new-token', RefreshNonce: 'new-session-nonce' });
    response.complete();

    await expect(first).resolves.toEqual({ AccessToken: 'new-token', RefreshNonce: 'new-session-nonce' });
    await expect(second).resolves.toEqual({ AccessToken: 'new-token', RefreshNonce: 'new-session-nonce' });
    expect(state.token()).toBe('new-token');
    expect(sessionStorage.getItem(SESSION_NONCE_KEY)).toBe('new-session-nonce');
    expect(localStorage.length).toBe(0);
  });

  it('updates a persistent nonce in persistent storage after refresh', async () => {
    const { state, server } = setup();
    localStorage.setItem(PERSISTENT_NONCE_KEY, 'old-persistent-nonce');
    server.postApiV1AuthRefresh.mockReturnValue(of({ AccessToken: 'new-token', RefreshNonce: 'new-persistent-nonce' }));

    await firstValueFrom(state.refreshToken());

    expect(server.postApiV1AuthRefresh).toHaveBeenCalledWith({
      body: { Nonce: 'old-persistent-nonce' },
    });
    expect(localStorage.getItem(PERSISTENT_NONCE_KEY)).toBe('new-persistent-nonce');
    expect(sessionStorage.length).toBe(0);
  });

  it('allows a new refresh request after an earlier request fails', async () => {
    const { state, server } = setup();
    const failedResponse = new Subject<AccessTokenOutputDto>();
    const recoveryResponse = new Subject<AccessTokenOutputDto>();
    server.postApiV1AuthRefresh.mockReturnValueOnce(failedResponse).mockReturnValueOnce(recoveryResponse);

    const failed = firstValueFrom(state.refreshToken());
    failedResponse.error(new Error('refresh failed'));
    await expect(failed).rejects.toThrow('refresh failed');

    const recovered = firstValueFrom(state.refreshToken());
    recoveryResponse.next({ AccessToken: 'recovered-token' });
    recoveryResponse.complete();

    await expect(recovered).resolves.toEqual({ AccessToken: 'recovered-token' });
    expect(server.postApiV1AuthRefresh).toHaveBeenCalledTimes(2);
    expect(state.token()).toBe('recovered-token');
  });

  it('returns the dummy token in relay mode without calling an auth API', async () => {
    const { state, server } = setup(true);

    await expect(firstValueFrom(state.refreshToken())).resolves.toEqual({ AccessToken: dummytoken });

    expect(state.token()).toBe(dummytoken);
    expect(server.postApiV1AuthRefresh).not.toHaveBeenCalled();
    expect(server.postApiV1AuthIssuetokenByOperation).not.toHaveBeenCalled();
  });

  it('uses the proxy socket token and refreshes it with a websocket operation token', async () => {
    const { state, server, http } = setup();
    client.setConfig({ baseUrl: '/proxy' });
    http.post.mockReturnValue(of({ authorized: true, socketToken: 'proxy-socket-token' }));
    server.postApiV1AuthIssuetokenByOperation.mockReturnValue(of({ Token: 'websocket-token' }));

    await expect(firstValueFrom(state.checkProxyAuthed())).resolves.toBe(true);

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = http.post.mock.calls[0] as [string, null, { headers: HttpHeaders }];
    expect(url).toBe('/proxy/api/v1/auth/status');
    expect(body).toBeNull();
    expect(options.headers.get('custom-proxy-check')).toBe('true');
    expect(state.token()).toBe('proxy-socket-token');

    await expect(firstValueFrom(state.refreshToken())).resolves.toEqual({ AccessToken: 'websocket-token' });

    expect(server.postApiV1AuthIssuetokenByOperation).toHaveBeenCalledWith({
      path: { operation: 'websocket' },
    });
    expect(server.postApiV1AuthRefresh).not.toHaveBeenCalled();
    expect(state.token()).toBe('websocket-token');
  });

  it('returns false when proxy authentication is unavailable', async () => {
    const { state, http } = setup();

    http.post
      .mockReturnValueOnce(of({ authorized: false }))
      .mockReturnValueOnce(throwError(() => new Error('offline')));

    await expect(firstValueFrom(state.checkProxyAuthed())).resolves.toBe(false);
    await expect(firstValueFrom(state.checkProxyAuthed())).resolves.toBe(false);
    expect(state.token()).toBeNull();
  });

  it.each([
    { rememberMe: false, storage: sessionStorage, key: SESSION_NONCE_KEY },
    { rememberMe: true, storage: localStorage, key: PERSISTENT_NONCE_KEY },
  ])('removes the nonce and clears authentication after logout when rememberMe is $rememberMe', async (testCase) => {
    const { state, server, router, logoutResponse } = setup();
    server.postApiV1AuthLogin.mockReturnValue(of({ AccessToken: 'access-token', RefreshNonce: 'refresh-nonce' }));
    await firstValueFrom(state.login('secret', testCase.rememberMe));

    state.logout();

    expect(state.isLoggingOut()).toBe(true);
    expect(testCase.storage.getItem(testCase.key)).toBeNull();
    expect(server.postApiV1AuthRefreshLogout).toHaveBeenCalledWith({
      body: { Nonce: 'refresh-nonce' },
    });
    expect(router.navigate).not.toHaveBeenCalled();

    logoutResponse.next({});
    logoutResponse.complete();

    expect(state.isLoggingOut()).toBe(false);
    expect(state.token()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
