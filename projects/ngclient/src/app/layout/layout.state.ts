import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { ShipSidenavType } from '@ship-ui/core/ship-sidenav';
import { defer, finalize } from 'rxjs';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { DuplicatiServer } from '../core/openapi';
import { WINDOW } from '../core/providers/window';

const UI_SETTINGS_SCHEME = 'ngclient';
const THEME_KEY = 'theme';
export type ServerTheme = 'system' | 'light' | 'dark';

declare global {
  interface Window {
    customData: string;
  }
}

@Injectable({
  providedIn: 'root',
})
export class LayoutState {
  #window = inject(WINDOW);
  #document = inject(DOCUMENT);
  #platformId = inject(PLATFORM_ID);
  #dupServer = inject(DuplicatiServer);
  #browserTheme = localStorageSignal<boolean | null>('darkTheme', null, true);
  #serverTheme = signal<ServerTheme>('system');
  #systemDark = signal(false);
  #destroyRef = inject(DestroyRef);
  serverTheme = this.#serverTheme.asReadonly();
  serverThemeLoading = signal(false);
  serverThemeLoaded = signal(false);
  serverThemeLoadError = signal(false);
  serverThemeSaving = signal(false);
  serverThemeSaveError = signal(false);
  followsServerTheme = computed(() => this.#browserTheme() === null);

  #currentWidth = signal(this.#window.innerWidth);
  isMobile = computed(() => this.#currentWidth() < 1024);
  sidenavType = signal<ShipSidenavType>(this.isMobile() ? 'overlay' : '');
  isNavOpen = signal(false);

  isDarkMode = computed(
    () =>
      this.#browserTheme() ?? (this.#serverTheme() === 'system' ? this.#systemDark() : this.#serverTheme() === 'dark')
  );

  darkModeEffect = effect(() => {
    if (this.isDarkMode()) {
      this.#document.documentElement.classList.add('dark');
      this.#document.documentElement.classList.remove('light');
    } else {
      this.#document.documentElement.classList.remove('dark');
      this.#document.documentElement.classList.add('light');
    }
  });

  isMobileEffect = effect(() => {
    this.isNavOpen.set(!this.isMobile());
    this.sidenavType.set(this.isMobile() ? 'overlay' : '');
  });

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      const media = this.#window.matchMedia?.('(prefers-color-scheme: dark)');
      if (media) {
        this.#systemDark.set(media.matches);
        const changed = (event: MediaQueryListEvent) => this.#systemDark.set(event.matches);
        media.addEventListener('change', changed);
        this.#destroyRef.onDestroy(() => media.removeEventListener('change', changed));
      }
      this.#window?.addEventListener('resize', () => {
        this.#currentWidth.set(this.#window.innerWidth);
      });
    }
  }

  toggleNav() {
    this.isNavOpen.set(!this.isNavOpen());
  }

  toggleBodyClass() {
    this.#browserTheme.set(!this.isDarkMode());
  }

  setDarkMode() {
    this.#browserTheme.set(true);
  }

  setLightMode() {
    this.#browserTheme.set(false);
  }

  useServerTheme() {
    this.#browserTheme.set(null);
  }

  // The shared value is only a default. Never copy it into the browser's personal preference.
  loadServerTheme() {
    if (this.serverThemeLoading() || this.serverThemeSaving()) return;
    this.serverThemeLoading.set(true);
    this.serverThemeLoadError.set(false);
    defer(() => this.#dupServer.getApiV1UisettingsByScheme({ path: { scheme: UI_SETTINGS_SCHEME } }))
      .pipe(finalize(() => this.serverThemeLoading.set(false)))
      .subscribe({
        next: (settings) => {
          const theme = settings?.[THEME_KEY];
          this.#serverTheme.set(theme === 'dark' || theme === 'light' ? theme : 'system');
          this.serverThemeLoaded.set(true);
        },
        error: () => this.serverThemeLoadError.set(true),
      });
  }

  // Only this explicit settings action changes the shared default; normal theme controls stay local.
  saveServerTheme(theme: ServerTheme) {
    if (
      !this.serverThemeLoaded() ||
      this.serverThemeLoading() ||
      this.serverThemeLoadError() ||
      this.serverThemeSaving()
    )
      return;
    if (theme === this.#serverTheme()) return;
    this.serverThemeSaving.set(true);
    this.serverThemeSaveError.set(false);
    defer(() =>
      this.#dupServer.patchApiV1UisettingsByScheme({
        path: { scheme: UI_SETTINGS_SCHEME },
        body: { [THEME_KEY]: theme },
      })
    )
      .pipe(finalize(() => this.serverThemeSaving.set(false)))
      .subscribe({
        next: () => this.#serverTheme.set(theme),
        error: () => this.serverThemeSaveError.set(true),
      });
  }
}
