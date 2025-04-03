import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SparkleFormFieldComponent, SparkleSelectComponent } from '@sparkle-ui/core';

const TIME_OPTIONS = [
  {
    value: 's',
    label: $localize`Seconds`,
  },
  {
    value: 'm',
    label: $localize`Minutes`,
  },
  {
    value: 'h',
    label: $localize`Hours`,
  },
];

@Component({
  selector: 'app-timespan',
  imports: [SparkleSelectComponent, SparkleFormFieldComponent, FormsModule],
  templateUrl: './timespan.component.html',
  styleUrl: './timespan.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: TimespanComponent,
      multi: true,
    },
  ],
})
export class TimespanComponent implements ControlValueAccessor {
  customId = input<string>();

  timespan = signal(0);
  unit = signal('s');
  timeOptions = signal(TIME_OPTIONS);
  readonly = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onChangeEffect = effect(() => {
    this.onChange(this.getValue());
  });

  writeValue(value: string): void {
    if (value) {
      const match = value.match(/(\d+)([smh])/);
      if (match) {
        this.timespan.set(parseInt(match[1], 10));
        this.unit.set(match[2]);
      } else {
        this.timespan.set(0);
        this.unit.set('s');
      }
    } else {
      this.timespan.set(0);
      this.unit.set('s');
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
