import { Injectable, effect, signal } from '@angular/core';
import { localStorageSignal } from '../core/functions/localstorage-signal';

declare global {
  interface Window {
    customData: string;
  }
}

@Injectable({
  providedIn: 'root',
})
export class LayoutState {
  #isDarkMode = localStorageSignal<boolean | null>('darkTheme', null, true);
  #isMobile = signal(window?.innerWidth <= 768);
  #isNavOpen = signal(false);

  isDarkMode = this.#isDarkMode.asReadonly();
  isMobile = this.#isMobile.asReadonly();
  isNavOpen = this.#isNavOpen.asReadonly();

  constructor() {
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme:dark)').matches;

    if (prefersDarkMode && this.#isDarkMode() === null) {
      this.setDarkMode();
    }

    effect(() => {
      if (this.#isDarkMode()) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    });
  }

  ngOnInit() {
    window.addEventListener('resize', this.#resizeHandler);
  }

  toggleNav() {
    this.#isNavOpen.set(!this.isNavOpen());
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

  #resizeHandler() {
    this.#isMobile.set(window.innerWidth <= 768);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.#resizeHandler);
  }
}
