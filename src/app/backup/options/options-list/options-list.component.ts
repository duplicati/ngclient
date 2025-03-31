import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleSelectComponent,
  SparkleToggleCardComponent,
  SparkleToggleComponent,
  SparkleTooltipComponent,
} from '@sparkle-ui/core';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { SettingInputDto } from '../../../core/openapi';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { FormView } from '../../destination/destination.config-utilities';

const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
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

type SettingItem = {
  Filter?: string | null;
  Name?: string | null;
  Value: ReturnType<typeof signal<any | null>>;
  FormView: FormView;
};

type SizeSettingItem = {
  Filter?: string | null;
  Name?: string | null;
  Value: ReturnType<typeof signal<string | null>>;
  unit: ReturnType<typeof signal<string>>;
  size: ReturnType<typeof signal<number>>;
  FormView: FormView;
};

type TimespanSettingItem = {
  Filter?: string | null;
  Name?: string | null;
  Value: ReturnType<typeof signal<string | null>>;
  unit: ReturnType<typeof signal<string>>;
  timespan: ReturnType<typeof signal<number>>;
  FormView: FormView;
};

@Component({
  selector: 'app-options-list',
  imports: [
    FormsModule,
    FileTreeComponent,
    SparkleToggleCardComponent,
    SparkleFormFieldComponent,
    SparkleButtonComponent,
    SparkleMenuComponent,
    SparkleTooltipComponent,
    SparkleIconComponent,
    SparkleSelectComponent,
    SparkleToggleComponent,
  ],
  templateUrl: './options-list.component.html',
  styleUrl: './options-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsListComponent {
  #sysInfo = inject(SysinfoState);

  options = model.required<SettingInputDto[]>();
  hiddenOptions = input<string[]>([]);
  hasFreeTextSettings = input(false);

  allOptionsGrouped = this.#sysInfo.allOptionsGrouped;
  allOptions = this.#sysInfo.allOptions;
  sizeOptions = signal(SIZE_OPTIONS);
  timeOptions = signal(TIME_OPTIONS);

  selectedSettings = computed(() => {
    const hiddenNames = this.hiddenOptions();
    const predefinedSettings = this.options()
      .map((setting) => {
        const option = this.allOptions().find((opt) => opt.name === setting.Name);

        if (option && !hiddenNames.includes(option.name)) {
          if (option.type === 'Size') {
            const _unit = setting.Value?.replace(/[0-9]/g, '');
            const _size = setting.Value?.replace(/[^0-9]/g, '');
            const unit = signal(_unit && _unit !== '' ? _unit : 'MB');
            const size = signal(_size && _size !== '' ? parseInt(_size!) : '');

            return {
              ...setting,
              Value: computed(() => size() + unit()),
              unit,
              size,
              FormView: option,
            } as SizeSettingItem;
          }

          if (option.type === 'Timespan') {
            const _unit = setting.Value?.replace(/[0-9]/g, '');
            const _time = setting.Value?.replace(/[^0-9]/g, '');
            const unit = signal(_unit && _unit !== '' ? _unit : 's');
            const time = signal(_time && _time !== '' ? parseInt(_time!) : '');

            return {
              ...setting,
              Value: computed(() => time() + unit()),
              unit,
              timespan: time,
              FormView: option,
            } as TimespanSettingItem;
          }

          let _value: any = setting.Value ?? '';

          if (option.type === 'Boolean') {
            _value = (_value && _value.toLowerCase() === 'true') || false;
          }

          if (option.type === 'Integer') {
            _value = parseInt(_value) || 0;
          }
          const valueSignal = signal(_value);

          return {
            ...setting,
            Value: valueSignal,
            FormView: option,
          } as SettingItem;
        } else if (this.hasFreeTextSettings()) {
          return {
            ...setting,
            Value: signal(setting.Value),
            FormView: {
              name: setting.Name,
              type: 'FreeText',
              shortDescription: 'Custom settings argument',
              longDescription: 'Custom settings argument',
            },
          };
        }

        return null;
      })
      .filter((x) => x !== null) as (SettingItem | SizeSettingItem)[];

    return predefinedSettings;
  });

  nonSelectedOptionsGrouped = computed(() => {
    const selectedNames = this.options().map((s) => s.Name);
    const hiddenNames = this.hiddenOptions();

    return this.allOptionsGrouped()
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => {
          // Available field types:
          // "String" | "Integer" | "Boolean" | "Timespan" | "Size" | "Enumeration" | "Path" |
          // "Password" | "Flags" | "Decimal" | "Unknown" | "FileTree" | "FolderTree" | "NonValidatedSelectableString" | "Email"

          // Currently no fields with 'Email', 'Unknown', 'FileTree', 'FolderTree' and 'NonValidatedSelectableString'

          return !selectedNames.includes(option.name) && !hiddenNames.includes(option.name);
        }),
      }))
      .filter((group) => group.options.length > 0);
  });

  addFreeTextSetting() {
    if (!this.hasFreeTextSettings()) return;

    // TODO Add dialog to prompt for name of the field show that its sluggified

    this.options.update((settings) => {
      return [
        ...settings,
        {
          Filter: null,
          Name: '',
          Value: '',
        },
      ];
    });
  }

  addSetting(option: FormView) {
    this.options.update((settings) => {
      let value: any = option.defaultValue ?? '';

      if (option.type === 'Boolean') {
        value = value.toLowerCase() === 'true' || false;
      }

      if (option.type === 'Integer') {
        value = parseInt(value) || 0;
      }

      const newSettings = [...settings, { Name: option.name, Value: value }];

      return newSettings;
    });
  }

  updateSettingValue(option: SettingItem, newValue: any) {
    this.options.update((settings) => {
      const newSettings = [...settings];
      const index = newSettings.findIndex((s) => s.Name === option.Name);

      if (option.FormView.type === 'Boolean') {
        newSettings[index].Value = newValue ? 'True' : 'False';
        return newSettings;
      }

      if (option.FormView.type === 'Integer') {
        newSettings[index].Value = newValue.toString();
        return newSettings;
      }

      newSettings[index].Value = newValue;
      return newSettings;
    });
  }

  updateFreeTextSettingName(option: SettingItem, newValue: string) {
    this.options.update((settings) => {
      const newSettings = [...settings];
      const index = newSettings.findIndex((s) => s.Name === option.Name);

      newSettings[index].Name = newValue;
      return newSettings;
    });
  }

  updateSizeSetting(option: SettingItem, newValue: string, property: 'size' | 'unit') {
    const _option = option as SizeSettingItem;

    this.options.update((settings) => {
      const newSettings = [...settings];
      const index = newSettings.findIndex((s) => s.Name === _option.Name);

      if (property === 'size') {
        newSettings[index].Value = `${newValue}${_option.unit()}`;
      }

      if (property === 'unit') {
        newSettings[index].Value = `${_option.size()}${newValue}`;
      }

      return newSettings;
    });
  }

  updateTimespanSetting(option: SettingItem, newValue: string, property: 'timespan' | 'unit') {
    const _option = option as TimespanSettingItem;

    this.options.update((settings) => {
      const newSettings = [...settings];
      const index = newSettings.findIndex((s) => s.Name === _option.Name);

      if (property === 'timespan') {
        newSettings[index].Value = `${newValue}${_option.unit()}`;
      }

      if (property === 'unit') {
        newSettings[index].Value = `${_option.timespan()}${newValue}`;
      }

      return newSettings;
    });
  }

  removeSetting(settingToRemove: SettingItem | SizeSettingItem) {
    this.options.update((settings) => {
      return settings.filter((setting) => setting.Name !== settingToRemove.Name);
    });
  }
}
