import { Directive, effect, ElementRef, inject, input, model, output } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

/** Preserve nullable legacy form values while rendering them as empty text. */
@Directive({
  selector: 'input[appNullableText], textarea[appNullableText]',
  host: {
    '(input)': 'updateValue()',
    '(blur)': 'touch.emit()',
    '[disabled]': 'disabled()',
    '[readOnly]': 'readonly()',
    '[required]': 'required()',
  },
})
export class NullableTextControl implements FormValueControl<string | null> {
  #element = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef);
  value = model<string | null>(null);
  disabled = input(false);
  readonly = input(false);
  required = input(false);
  touch = output<void>();

  updateValue() {
    this.value.set(this.#element.nativeElement.value);
  }

  #writeValue = effect(() => {
    const value = this.value() ?? '';
    const element = this.#element.nativeElement;
    if (element.value !== value) element.value = value;
  });
}
