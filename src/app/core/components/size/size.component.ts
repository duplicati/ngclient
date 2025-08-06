import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ShipFormFieldComponent, ShipSelectComponent } from '@ship-ui/core';

const SIZE_OPTIONS = [
  {
    value: 'bytes',
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

const PER_SECOND_FIELDS = ['throttle-upload', 'throttle-download'];

@Component({
  selector: 'app-size',
  imports: [ShipSelectComponent, ShipFormFieldComponent, FormsModule],
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

  timespan = signal(0);
  unit = signal('MB');
  sizeOptions = signal(SIZE_OPTIONS);
  readonly = signal(false);
  hasPerSecond = computed(() => {
    const inputType = this.inputType();
    return inputType && PER_SECOND_FIELDS.includes(inputType);
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onChangeEffect = effect(() => {
    this.onChange(this.getValue());
  });

  writeValue(value: string): void {
    if (value) {
      const match = value.match(/^(\d+)(bytes|kb|mb|gb|tb|pb|b)$/i);

      if (match) {
        this.timespan.set(parseInt(match[1], 10));
        this.unit.set(match[2].toUpperCase());
      } else {
        this.timespan.set(0);
        this.unit.set('MB');
      }
    } else {
      this.timespan.set(0);
      this.unit.set('MB');
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
