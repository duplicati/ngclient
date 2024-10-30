import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleCheckboxComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleOptionComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { ICommandLineArgument, SettingInputDto } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { FormView } from '../destination/destination.config';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const RETENTION_OPTIONS = [
  {
    value: '',
    name: 'Keep all backups',
  },
  {
    value: 'time',
    name: 'Delete backups that are older than',
  },
  {
    value: 'versions',
    name: 'Keep a specific number of backups',
  },
  {
    value: 'smart',
    name: 'Smart backup retention',
  },
  {
    value: 'custom',
    name: 'Custom backup retention',
  },
] as const;

export type SizeOptions = (typeof SIZE_OPTIONS)[number];
type RetentionOptions = (typeof RETENTION_OPTIONS)[number];

export const createOptionsForm = (
  defaults = {
    remoteVolumeSize: 50,
    size: 'MB' as SizeOptions,
    backupRetention: '' as RetentionOptions['value'],
    advancedOptions: [],
  }
) => {
  return fb.group({
    remoteVolumeSize: fb.group({
      size: fb.control<number>(defaults.remoteVolumeSize),
      unit: fb.control<SizeOptions>(defaults.size),
    }),
    backupRetention: fb.control<RetentionOptions['value']>(defaults.backupRetention),
    advancedOptions: fb.group({}),
  });
};

export const createAdvancedOption = (name: string | null | undefined, defaultValue: string | null | undefined) => {
  return fb.group({
    name: fb.control<SettingInputDto['Name']>(name),
    value: fb.control<SettingInputDto['Value']>(defaultValue),
  });
};

@Component({
  selector: 'app-options',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,

    SparkleMenuComponent,
    SparkleSelectComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleToggleComponent,
    SparkleCheckboxComponent,
    SparkleOptionComponent,
    ToggleCardComponent,
    JsonPipe,
  ],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OptionsComponent {
  #sysinfo = inject(SysinfoState);
  #backupState = inject(BackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  optionsForm = this.#backupState.optionsForm;
  finishedLoading = this.#backupState.finishedLoading;
  selectedAdvancedOptions = this.#backupState.selectedAdvancedOptions;
  nonSelectedAdvancedOptions = this.#backupState.nonSelectedAdvancedOptions;
  sizeOptions = signal(SIZE_OPTIONS);
  rentationOptions = signal(RETENTION_OPTIONS);
  sysinfoLoaded = this.#sysinfo.isLoaded;

  removeOption(option: FormView) {
    this.#backupState.removeOptionFromFormGroup(option);
  }

  addNewOption(option: ICommandLineArgument) {
    this.#backupState.addOptionToFormGroup(option);
  }

  retentionOptionDisplayFn() {
    const items = this.rentationOptions();
    return (val: string) => {
      const item = items.find((x) => x.value === val);

      if (!item) {
        return '';
      }

      return item.name;
    };
  }

  displayFn() {
    const items = this.#backupState.advancedOptions();

    return (val: string) => {
      const item = items.find((x) => x.Name === val);

      if (!item) {
        return '';
      }

      return `${item.Name}`;
    };
  }

  goBack() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }

  submit() {
    this.#backupState.submit();
  }
}
