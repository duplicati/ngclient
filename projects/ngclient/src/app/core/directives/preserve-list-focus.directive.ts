import { DOCUMENT } from '@angular/common';
import { afterEveryRender, Directive, DoCheck, ElementRef, inject } from '@angular/core';

/** Keep focus on a surviving control when a keyed list moves its DOM node. */
@Directive({ selector: '[appPreserveListFocus]' })
export class PreserveListFocusDirective implements DoCheck {
  #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #document = inject(DOCUMENT);
  #focusedBeforeCheck: HTMLElement | null = null;

  constructor() {
    afterEveryRender({
      write: () => {
        const focused = this.#focusedBeforeCheck;
        this.#focusedBeforeCheck = null;
        // Never override a newer focus choice, or replace a removed/disabled action.
        if (
          focused?.isConnected &&
          this.#host.contains(focused) &&
          this.#document.activeElement === this.#document.body &&
          !focused.matches(':disabled') &&
          !focused.closest('[inert]')
        ) {
          focused.focus({ preventScroll: true });
        }
      },
    });
  }

  ngDoCheck() {
    const focused = this.#document.activeElement;
    this.#focusedBeforeCheck = focused instanceof HTMLElement && this.#host.contains(focused) ? focused : null;
  }
}
