import { Directive, effect, ElementRef, inject, input, model, output } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { SettingInputDto } from '../../../core/openapi';
import { FormView } from '../../destination/destination.config-utilities';

export function isOptionTrue(value: any): boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

export function optionDisplayValue(value: any, option?: FormView) {
  value ??= '';
  if (option?.type === 'Boolean') return isOptionTrue(value);
  if (option?.type === 'Integer') return parseInt(value) || 0;
  if (option?.type === 'Enumeration' && option.options) {
    const normalized = value.trim().toLowerCase();
    return option.options.find((choice) => (choice ?? '').trim().toLocaleLowerCase() === normalized) ?? value;
  }
  if (option?.type === 'Flags' && option.options && typeof value === 'string') {
    return value
      .split(',')
      .map((part) => {
        const normalized = part.trim().toLowerCase();
        return option.options!.find((choice) => choice.trim().toLowerCase() === normalized) ?? part;
      })
      .join(',');
  }
  return value;
}

export function serializeOptionValue(option: FormView, value: any): SettingInputDto['Value'] {
  if (option.type === 'Boolean') return isOptionTrue(value) ? 'True' : 'False';
  if (option.type === 'Integer') return value.toString();
  if (option.type === 'Enumeration' && option.options) {
    const normalized = value?.trim().toLowerCase() ?? '';
    const choice = option.options.find((choice) => (choice ?? '').trim().toLocaleLowerCase() === normalized);
    if (choice) return choice;
  }
  return value;
}

/** Display typed options while keeping their original serialized value until the user edits them. */
@Directive({
  selector: 'input[appOptionValue]',
  host: {
    '(input)': 'updateValue()',
    '(blur)': 'touch.emit()',
    '[disabled]': 'disabled()',
    '[readOnly]': 'readonly()',
  },
})
export class OptionValueControl implements FormValueControl<string | null> {
  #element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  definition = input.required<FormView>({ alias: 'appOptionValue' });
  value = model<string | null>(null);
  disabled = input(false);
  readonly = input(false);
  touch = output<void>();

  updateValue() {
    const element = this.#element.nativeElement;
    const definition = this.definition();
    const displayed = optionDisplayValue(this.value(), definition);
    if (definition.type === 'Boolean') {
      if (element.checked === displayed) return;
      this.value.set(serializeOptionValue(definition, element.checked) ?? null);
    } else {
      // Selects and the file tree can emit input events during initialization.
      if (element.value === String(displayed)) return;
      this.value.set(serializeOptionValue(definition, element.value) ?? null);
    }
  }

  #writeValue = effect(() => {
    const element = this.#element.nativeElement;
    const definition = this.definition();
    const displayed = optionDisplayValue(this.value(), definition);
    if (definition.type === 'Boolean') {
      element.checked = displayed;
    } else if (element.value !== String(displayed)) {
      element.value = String(displayed);
    }
  });
}
