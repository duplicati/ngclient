import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { disabled, form, FormField } from '@angular/forms/signals';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { splitSize } from '../../functions/parse-size';

const PER_SECOND_FIELDS = ['throttle-upload', 'throttle-download'];

export const SIZE_OPTIONS = [
  {
    value: 'B',
    label: 'Bytes',
  },
  {
    value: 'KB',
    label: 'KB',
  },
  {
    value: 'MB',
    label: 'MB',
  },
  {
    value: 'GB',
    label: 'GB',
  },
  {
    value: 'TB',
    label: 'TB',
  },
  {
    value: 'PB',
    label: 'PB',
  },
];

@Component({
  selector: 'app-size',
  imports: [ShipSelect, ShipFormField, FormsModule, FormField],
  templateUrl: './size.component.html',
  styleUrl: './size.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: SizeComponent,
      multi: true,
    },
  ],
})
export class SizeComponent implements ControlValueAccessor {
  customId = input<string>();
  inputType = input<string | null>();
  sizeChange = output<string>();

  timespan = signal<number | null>(0);
  unit = signal('MB');
  sizeOptions = signal(SIZE_OPTIONS);
  readonly = signal(false);
  amountField = form(this.timespan, (field) => disabled(field, () => this.readonly()));
  hasPerSecond = computed(() => {
    const inputType = this.inputType();
    return inputType && PER_SECOND_FIELDS.includes(inputType);
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  #lastValue = this.getValue();
  #pendingWrite = 0;
  #writingValue = false;

  onChangeEffect = effect(() => {
    const value = this.getValue();
    if (this.#writingValue || value === this.#lastValue) return;
    this.#lastValue = value;
    this.onChange(value);
    this.sizeChange.emit(value);
  });

  writeValue(value: string): void {
    const write = ++this.#pendingWrite;
    if (value) {
      const parsed = splitSize(value);
      this.#writingValue = true;
      queueMicrotask(() => {
        if (write !== this.#pendingWrite) return;
        this.timespan.set(parsed.size);
        this.unit.set(parsed.unit);
        this.#lastValue = this.getValue();
        this.#writingValue = false;
      });
    } else {
      this.#writingValue = false;
      this.timespan.set(0);
      this.unit.set('MB');
      this.#lastValue = this.getValue();
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.readonly.set(isDisabled);
  }

  private getValue(): string {
    return `${this.timespan()}${this.unit()}`;
  }
}
