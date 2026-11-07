import { Directive, ElementRef, inject } from '@angular/core';

/** Keyboard activation for non-native actions; native controls keep browser semantics. */
@Directive({
  selector: '[appKeyboardAction]',
  host: {
    role: 'button',
    tabindex: '0',
    '[attr.aria-hidden]': 'null',
    '(keydown)': 'onKeydown($event)',
    '(keyup)': 'onKeyup($event)',
    '(blur)': 'cancelSpace()',
  },
})
export class KeyboardActionDirective {
  #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #spacePressed = false;

  #canActivate(event: KeyboardEvent) {
    return (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.target === this.#element &&
      !this.#element.hasAttribute('disabled') &&
      this.#element.getAttribute('aria-disabled') !== 'true'
    );
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.#canActivate(event) || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.key === 'Enter') this.#element.click();
    else this.#spacePressed = true;
  }

  onKeyup(event: KeyboardEvent) {
    if (event.key !== ' ') return;
    const activate = this.#spacePressed && this.#canActivate(event);
    this.#spacePressed = false;
    if (activate) {
      event.preventDefault();
      this.#element.click();
    }
  }

  cancelSpace() {
    this.#spacePressed = false;
  }
}
