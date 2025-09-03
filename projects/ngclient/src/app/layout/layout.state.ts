import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { ShipSidenavType } from '@ship-ui/core';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { WINDOW } from '../core/providers/window';

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
  #isDarkMode = localStorageSignal<boolean | null>('darkTheme', null, true);

  #currentWidth = signal(this.#window.innerWidth);
  isMobile = computed(() => this.#currentWidth() < 1024);
  sidenavType = signal<ShipSidenavType>(this.isMobile() ? 'overlay' : '');
  isNavOpen = signal(false);

  isDarkMode = this.#isDarkMode.asReadonly();

  darkModeEffect = effect(() => {
    if (this.#isDarkMode()) {
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
      this.#window?.addEventListener('resize', () => {
        this.#currentWidth.set(this.#window.innerWidth);
      });
    }
  }

  toggleNav() {
    this.isNavOpen.set(!this.isNavOpen());
  }

  toggleBodyClass() {
    this.#isDarkMode.set(!this.isDarkMode());
  }

  setDarkMode() {
    this.#isDarkMode.set(true);
  }

  setLightMode() {
    this.#isDarkMode.set(false);
  }
}
