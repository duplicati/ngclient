import { NgTemplateOutlet } from '@angular/common';
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
  SparkleTooltipDirective,
} from '@sparkle-ui/core';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../../core/components/size/size.component';
import { TimespanComponent } from '../../../core/components/timespan/timespan.component';
import { SettingDto, SettingInputDto } from '../../../core/openapi';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { FormView } from '../../destination/destination.config-utilities';

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

@Component({
  selector: 'app-options-list',
  imports: [
    FormsModule,
    FileTreeComponent,
    SparkleToggleCardComponent,
    SparkleFormFieldComponent,
    SparkleButtonComponent,
    SparkleMenuComponent,
    SparkleTooltipDirective,
    SparkleIconComponent,
    SparkleSelectComponent,
    SparkleToggleComponent,
    SizeComponent,
    TimespanComponent,
    NgTemplateOutlet,
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
  applicationOptions = input<SettingDto[] | null | undefined>();

  allOptionsGrouped = this.#sysInfo.allOptionsGrouped;
  allOptions = this.#sysInfo.allOptions;

  selectedSettings = computed(() => {
    const hiddenNames = this.hiddenOptions();
    const options = this.options();

    const predefinedSettings = options
      .map((setting) => {
        const option = this.allOptions().find((opt) => opt.name === setting.Name?.replace('--', ''));

        let _value: any = setting.Value ?? '';

        if (option && hiddenNames.includes(option.name))
          return null;

        if (option) {
          if (option.type === 'Boolean') {
            _value = this.isTrue(_value);
          }

          if (option.type === 'Integer') {
            _value = parseInt(_value) || 0;
          }

          return {
            ...setting,
            Value: signal(_value),
            FormView: option,
          } as SettingItem;
        } else if (this.hasFreeTextSettings()) {
          return {
            ...setting,
            Value: signal(_value),
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

  isTrue(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on';
    }
    return false;
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

      if (option.FormView.type === 'Boolean') {
        newSettings[index].Value = this.isTrue(newValue) ? 'True' : 'False';
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

  removeSetting(settingToRemove: SettingItem | SizeSettingItem) {
    this.options.update((settings) => {
      return settings.filter((setting) => setting.Name !== settingToRemove.Name);
    });
  }
}
