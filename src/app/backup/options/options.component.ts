import { NgTemplateOutlet } from '@angular/common';
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
  SparkleTooltipComponent,
} from '@sparkle-ui/core';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { SettingInputDto } from '../../core/openapi';
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
    SparkleTooltipComponent,
    FileTreeComponent,
    ToggleCardComponent,
  ],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OptionsComponent {
  #backupState = inject(BackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  optionsForm = this.#backupState.optionsForm;
  selectedOptions = this.#backupState.selectedOptions;
  nonSelectedOptions = this.#backupState.nonSelectedOptions;
  isSubmitting = this.#backupState.isSubmitting;
  sizeOptions = signal(SIZE_OPTIONS);
  rentationOptions = signal(RETENTION_OPTIONS);

  oauthStartTokenCreation(_: any) {}
  getFormFieldValue(
    destinationIndex: number,
    formGroupName: 'custom' | 'dynamic' | 'advanced',
    formControlName: string
  ) {
    const group = this.optionsForm.controls.advancedOptions as any;

    return group.controls[formControlName].value;
  }

  removeFormView(option: FormView, _: any) {
    this.#backupState.removeOptionFromFormGroup(option);
  }

  addNewOption(option: FormView) {
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
      const item = items.find((x) => x.name === val);

      if (!item) {
        return '';
      }

      return `${item.name}`;
    };
  }

  goBack() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }

  submit() {
    this.#backupState.submit();
  }
}
