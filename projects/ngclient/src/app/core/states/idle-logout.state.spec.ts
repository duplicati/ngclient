import { HttpClient } from '@angular/common/http';
import { createEnvironmentInjector, DestroyRef, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { AppAuthState } from './app-auth.state';
import { IDLE_LOGOUT_CHECK_INTERVAL_MS, IdleLogoutState } from './idle-logout.state';
import { RelayconfigState } from './relayconfig.state';

const MINUTE = 60_000;

describe('IdleLogoutState', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  const setup = async (options: { relayIsEnabled?: boolean; signedIn?: boolean } = {}) => {
    const server = {
      postApiV1AuthLogin: vi.fn(() => of({ AccessToken: 'access-token', RefreshNonce: 'refresh-nonce' })),
      postApiV1AuthRefresh: vi.fn(() => of({})),
      postApiV1AuthIssuetokenByOperation: vi.fn(() => of({})),
      postApiV1AuthRefreshLogout: vi.fn(() => of({})),
    };
    const router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        LOCALSTORAGE,
        { provide: DuplicatiServer, useValue: server },
        { provide: HttpClient, useValue: { post: vi.fn(() => of({ authorized: false })) } },
        { provide: Router, useValue: router },
        { provide: RelayconfigState, useValue: { relayIsEnabled: vi.fn(() => options.relayIsEnabled ?? false) } },
      ],
    });

    const auth = TestBed.inject(AppAuthState);
    if (options.signedIn ?? true) await firstValueFrom(auth.login('secret', false));

    const state = TestBed.inject(IdleLogoutState);
    const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    const watch = () => state.watch(scope.get(DestroyRef));

    return { state, server, router, scope, watch };
  };

  it('does not sign out by default', async () => {
    const { state, server, watch } = await setup();
    watch();

    expect(state.idleLogoutMinutes()).toBe(0);
    vi.advanceTimersByTime(24 * 60 * MINUTE);

    expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();
  });

  it('signs out once the configured time has passed without activity', async () => {
    const { state, server, router, watch } = await setup();
    state.setIdleLogoutMinutes(5);
    watch();

    vi.advanceTimersByTime(5 * MINUTE - IDLE_LOGOUT_CHECK_INTERVAL_MS);
    expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(IDLE_LOGOUT_CHECK_INTERVAL_MS);
    expect(server.postApiV1AuthRefreshLogout).toHaveBeenCalledExactlyOnceWith({ body: { Nonce: 'refresh-nonce' } });
    expect(router.navigate).toHaveBeenCalledWith(['/login']);

    vi.advanceTimersByTime(10 * MINUTE);
    expect(server.postApiV1AuthRefreshLogout).toHaveBeenCalledOnce();
  });

  it.each(['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'scroll'])(
    'restarts the idle time on %s',
    async (eventName) => {
      const { state, server, watch } = await setup();
      state.setIdleLogoutMinutes(5);
      watch();

      vi.advanceTimersByTime(4 * MINUTE);
      document.body.dispatchEvent(new Event(eventName, { bubbles: true }));
      vi.advanceTimersByTime(4 * MINUTE);

      expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(MINUTE + IDLE_LOGOUT_CHECK_INTERVAL_MS);
      expect(server.postApiV1AuthRefreshLogout).toHaveBeenCalledOnce();
    }
  );

  it('keeps the session while another tab of the same browser is in use', async () => {
    const { state, server, watch } = await setup();
    state.setIdleLogoutMinutes(5);
    watch();

    // A second tab has its own state instance and only shares the browser storage with this one
    const otherTab = createEnvironmentInjector([IdleLogoutState], TestBed.inject(EnvironmentInjector));
    const otherState = otherTab.get(IdleLogoutState);
    expect(otherState).not.toBe(state);

    vi.advanceTimersByTime(4 * MINUTE);
    otherState.watch(otherTab.get(DestroyRef));
    otherTab.destroy();
    vi.advanceTimersByTime(4 * MINUTE);

    expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MINUTE + IDLE_LOGOUT_CHECK_INTERVAL_MS);
    expect(server.postApiV1AuthRefreshLogout).toHaveBeenCalledOnce();
  });

  it('checks as soon as the tab becomes visible again after the machine slept', async () => {
    const { state, server, watch } = await setup();
    state.setIdleLogoutMinutes(5);
    watch();

    // The clock moves while timers are suspended
    vi.setSystemTime(Date.now() + 48 * 60 * MINUTE);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(server.postApiV1AuthRefreshLogout).toHaveBeenCalledOnce();
  });

  it('leaves relay sessions alone', async () => {
    const { state, server, watch } = await setup({ relayIsEnabled: true });
    state.setIdleLogoutMinutes(5);
    watch();

    vi.advanceTimersByTime(60 * MINUTE);

    expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();
  });

  it('does nothing when not signed in', async () => {
    const { state, server, watch } = await setup({ signedIn: false });
    state.setIdleLogoutMinutes(5);
    watch();

    vi.advanceTimersByTime(60 * MINUTE);

    expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();
  });

  it('stops watching when the scope is destroyed', async () => {
    const { state, server, scope, watch } = await setup();
    state.setIdleLogoutMinutes(5);
    watch();
    scope.destroy();

    vi.advanceTimersByTime(60 * MINUTE);

    expect(server.postApiV1AuthRefreshLogout).not.toHaveBeenCalled();
  });

  it('remembers the setting in this browser', async () => {
    const first = await setup();
    first.state.setIdleLogoutMinutes(30);

    TestBed.resetTestingModule();
    const second = await setup();

    expect(second.state.idleLogoutMinutes()).toBe(30);
  });

  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY])('treats %s minutes as off', async (minutes) => {
    const { state } = await setup();
    state.setIdleLogoutMinutes(minutes);

    expect(state.idleLogoutMinutes()).toBe(0);
  });
});
