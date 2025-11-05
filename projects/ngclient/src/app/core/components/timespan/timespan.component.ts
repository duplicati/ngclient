import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ShipButton, ShipFormField, ShipMenu } from '@ship-ui/core';

const SHORT_TIME_OPTIONS = [
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

const DEFAULT_TIME_OPTIONS = [
  {
    value: 'Y',
    label: $localize`Years`,
  },
  {
    value: 'M',
    label: $localize`Months`,
  },
  {
    value: 'W',
    label: $localize`Weeks`,
  },
  {
    value: 'D',
    label: $localize`Days`,
  },
];

const SHORT_FIELD_TYPES = [
  'retry-delay',
  'web-timeout',
  'read-write-timeout',
  'run-script-timeout',
  'list-timeout',
  'short-timeout',
];

@Component({
  selector: 'app-timespan',
  imports: [ShipMenu, ShipFormField, FormsModule, ShipButton],
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
  inputType = input<string | null>();

  timespan = signal(0);
  #defaultUnit = 'D';
  unit = signal(this.#defaultUnit);
  unitLabel = computed(() => {
    const options = this.timeOptions();
    const index = options.findIndex((x) => x.value === this.unit());
    return options[index]?.label ?? this.unit();
  });

  isShortTime = computed(() => {
    const inputType = this.inputType();
    return inputType && SHORT_FIELD_TYPES.includes(inputType.replace('--', ''));
  });

  timeOptions = computed(() => {
    if (this.isShortTime()) {
      return SHORT_TIME_OPTIONS;
    }

    return DEFAULT_TIME_OPTIONS;
  });

  readonly = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onChangeEffect = effect(() => {
    this.onChange(this.getValue());
  });

  inputTypeEffect = effect(() => {
    const _ = this.timeOptions();
    const overrideDefaultUnit = this.isShortTime() ? 's' : 'D';
    this.#defaultUnit = overrideDefaultUnit;
    this.unit.set(overrideDefaultUnit);
  });

  updateUnit(unit: string) {
    this.unit.set(unit);
  }

  writeValue(value: string): void {
    const isShortTime = this.isShortTime();

    if (value) {
      const regex = isShortTime ? /(\d+)([smh])/i : /^(\d+)([YMWD])$/i;
      const match = value.match(regex);

      if (match) {
        this.timespan.set(parseInt(match[1], 10));
        this.unit.set(match[2]);
      } else {
        this.timespan.set(0);
        this.unit.set(this.#defaultUnit);
      }
    } else {
      this.timespan.set(0);
      this.unit.set(this.#defaultUnit);
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
