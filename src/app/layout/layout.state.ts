import { Injectable, effect, inject, signal } from '@angular/core';
import { LOCALSTORAGE } from '../core/services/localstorage.token';

declare global {
  interface Window {
    customData: string;
  }
}

@Injectable({
  providedIn: 'root',
})
export class LayoutState {
  #ls = inject(LOCALSTORAGE);
  #storedDarkMode = this.#ls.getItemParsed<boolean>('darkTheme', true);
  #isDarkMode = signal(false);
  #isMobile = signal(window?.innerWidth <= 768);
  #isNavOpen = signal(false);

  isDarkMode = this.#isDarkMode.asReadonly();
  isMobile = this.#isMobile.asReadonly();
  isNavOpen = this.#isNavOpen.asReadonly();

  constructor() {
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme:dark)').matches;

    if (prefersDarkMode && this.#storedDarkMode) {
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
    this.#ls.setItemParsed('darkTheme', !this.isDarkMode(), true);
    this.#isDarkMode.set(!this.isDarkMode());
  }

  setDarkMode() {
    this.#ls.setItemParsed('darkTheme', true, true);
    this.#isDarkMode.set(true);
  }

  setLightMode() {
    this.#ls.setItemParsed('darkTheme', false, true);
    this.#isDarkMode.set(false);
  }

  #resizeHandler() {
    this.#isMobile.set(window.innerWidth <= 768);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.#resizeHandler);
  }
}
