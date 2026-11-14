import { DestroyRef, inject, Injectable } from '@angular/core';
import { localStorageSignal } from '../functions/localstorage-signal';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { AppAuthState } from './app-auth.state';

const LOCALSTORAGE_IDLE_LOGOUT_MINUTES = 'idleLogoutMinutes';
// Shared between tabs, so a tab left in the background does not sign out a session that is used in another tab
const LOCALSTORAGE_LAST_ACTIVITY = 'idleLogoutLastActivity';

export const IDLE_LOGOUT_CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_STORE_INTERVAL_MS = 5_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/** The choices offered in the settings, in minutes. Zero turns the idle sign-out off. */
export const IDLE_LOGOUT_MINUTE_OPTIONS = [0, 5, 15, 30, 60, 120, 240] as const;

/**
 * Signs the user out when the interface has not been used for the configured time.
 * The interface keeps refreshing the session while it is open, so without this an
 * unattended browser stays signed in for as long as the tab is open.
 * The setting is stored per browser and is off by default.
 */
@Injectable({
  providedIn: 'root',
})
export class IdleLogoutState {
  #auth = inject(AppAuthState);
  #ls = inject(LOCALSTORAGE);
  #minutes = localStorageSignal<number>(LOCALSTORAGE_IDLE_LOGOUT_MINUTES, 0);
  #lastActivity = 0;
  #lastStoredActivity = 0;

  idleLogoutMinutes = this.#minutes.asReadonly();

  setIdleLogoutMinutes(minutes: number) {
    const value = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
    this.#recordActivity(true);
    this.#minutes.set(value);
  }

  /** Watches for user activity until the given scope is destroyed. */
  watch(destroyRef: DestroyRef) {
    const onActivity = () => this.#recordActivity(false);
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };

    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, onActivity, listenerOptions);
    // A timer does not run while the machine sleeps, so check again as soon as the tab is shown
    document.addEventListener('visibilitychange', this.#check);
    const interval = setInterval(this.#check, IDLE_LOGOUT_CHECK_INTERVAL_MS);

    this.#recordActivity(true);

    destroyRef.onDestroy(() => {
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, onActivity, listenerOptions);
      document.removeEventListener('visibilitychange', this.#check);
      clearInterval(interval);
    });
  }

  #recordActivity(force: boolean) {
    const now = Date.now();
    this.#lastActivity = now;

    if (force || now - this.#lastStoredActivity >= ACTIVITY_STORE_INTERVAL_MS) {
      this.#lastStoredActivity = now;
      this.#ls.setItemParsed(LOCALSTORAGE_LAST_ACTIVITY, now);
    }
  }

  #check = () => {
    const minutes = this.#minutes();
    if (minutes <= 0 || !this.#auth.token() || this.#auth.isLoggingOut()) return;

    const stored = this.#ls.getItemParsed<number>(LOCALSTORAGE_LAST_ACTIVITY);
    const lastActivity = Math.max(this.#lastActivity, typeof stored === 'number' ? stored : 0);

    if (Date.now() - lastActivity >= minutes * 60_000) this.#auth.signOutAfterIdle();
  };
}
