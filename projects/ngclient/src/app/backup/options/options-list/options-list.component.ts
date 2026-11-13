import { KeyboardActionDirective } from '../../../core/directives/keyboard-action.directive';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  model,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField } from '@angular/forms/signals';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../../core/components/size/size.component';
import { TimespanComponent } from '../../../core/components/timespan/timespan.component';
import { SettingDto, SettingInputDto } from '../../../core/openapi';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { FormView, parseKeyValueTextToSettings } from '../../destination/destination.config-utilities';
import { OPTIONS_LIST_CUSTOM_CONFIG } from './options-list.config';
import { isOptionTrue, optionDisplayValue, OptionValueControl, serializeOptionValue } from './option-value-control';

type SettingItem = {
  Filter?: string | null;
  Name?: string | null;
  Value: any;
  Index: number;
  FormView: FormView;
};

@Component({
  selector: 'app-options-list',
  imports: [
    KeyboardActionDirective,
    FormsModule,
    FormField,
    OptionValueControl,
    FileTreeComponent,
    SizeComponent,
    TimespanComponent,
    NgTemplateOutlet,

    ShipFormField,
    ShipButton,
    ShipMenu,
    ShipTooltip,
    ShipIcon,
    ShipSelect,
    ShipToggle,
  ],
  templateUrl: './options-list.component.html',
  styleUrl: './options-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsListComponent {
  #sysInfo = inject(SysinfoState);

  options = model.required<SettingInputDto[]>();
  // Keep form metadata out of the DTO objects, and preserve absent/null values on load.
  settingValues = linkedSignal(() => this.options().map((setting) => setting.Value ?? null));
  settingsForm = form(this.settingValues);
  #syncEditedValues = effect(() => {
    const values = this.settingValues();
    const settings = this.options();
    if (settings.some((setting, index) => !Object.is(setting.Value ?? null, values[index]))) {
      untracked(() =>
        this.options.set(
          settings.map((setting, index) =>
            Object.is(setting.Value ?? null, values[index]) ? setting : { ...setting, Value: values[index] }
          )
        )
      );
    }
  });
  hiddenOptions = input<string[]>([]);
  hasFreeTextSettings = input(false);
  applicationOptions = input<SettingDto[] | null | undefined>();
  showTextArea = signal(false);
  showOptionNames = signal(false);

  allOptionsGrouped = this.#sysInfo.allOptionsGrouped;
  allOptions = this.#sysInfo.allOptions;

  selectedSettings = computed(() => {
    const hiddenNames = this.hiddenOptions();
    const options = this.options();

    const predefinedSettings = options
      .map((setting, index) => {
        let option = this.allOptions().find((opt) => opt.name === setting.Name?.replace('--', ''));

        const _value = optionDisplayValue(setting.Value, option);

        if (option && hiddenNames.includes(option.name)) return null;

        if (option) {
          const override = OPTIONS_LIST_CUSTOM_CONFIG.find((x) => x.name === option?.name);
          if (override) {
            option = {
              ...option,
              ...override,
            };
          }

          return {
            ...setting,
            Value: _value,
            Index: index,
            FormView: option,
          } as SettingItem;
        } else if (this.hasFreeTextSettings()) {
          return {
            ...setting,
            Value: _value,
            Index: index,
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
      .filter((x) => x !== null) as SettingItem[];

    return predefinedSettings;
  });

  nonSelectedOptionsGrouped = computed(() => {
    const selectedNames = this.options().map((s) => s.Name?.replace('--', ''));
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

  settingsAsText = computed(() => {
    return this.selectedSettings()
      .map((setting) => {
        const value = setting.Value;

        let valueString = '';
        if (typeof value === 'boolean') {
          valueString = this.isTrue(value) ? 'True' : 'False';
        } else if (typeof value === 'number') {
          valueString = value.toString();
        } else if (value !== null && value !== undefined) {
          valueString = value.toString();
        }
        const name = setting.Name ?? '';
        return `${name}=${valueString}`;
      })
      .join('\n');
  });

  updateSettingsFromText(newValue: any) {
    if (typeof newValue !== 'string') return;

    const newSettings = parseKeyValueTextToSettings(newValue);
    this.options.update(() => newSettings);
  }

  isTrue(value: any): boolean {
    return isOptionTrue(value);
  }

  inAppOptions(optionName: string) {
    const optionIndex = this.applicationOptions()?.findIndex((x) => x.Name?.replace('--', '') === optionName);

    if (optionIndex === undefined) {
      return false;
    }

    return optionIndex > -1;
  }

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
        value = this.isTrue(value);
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

      newSettings[index].Value = serializeOptionValue(option.FormView, newValue);
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

  removeSetting(settingToRemove: SettingItem) {
    this.options.update((settings) => {
      return settings.filter((setting) => setting.Name !== settingToRemove.Name);
    });
  }
}
