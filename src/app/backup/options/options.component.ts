import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleSelectNewComponent,
  SparkleToggleComponent,
  SparkleTooltipComponent,
} from '@sparkle-ui/core';
import { debounceTime, of } from 'rxjs';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { BackupState } from '../backup.state';
import { FormView } from '../destination/destination.config-utilities';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
const RETENTION_OPTIONS = [
  {
    value: '',
    name: $localize`Keep all backups`,
  },
  {
    value: 'time',
    name: $localize`Delete backups that are older than`,
  },
  {
    value: 'versions',
    name: $localize`Keep a specific number of backups`,
  },
  {
    value: 'smart',
    name: $localize`Smart backup retention`,
  },
  {
    value: 'custom',
    name: $localize`Custom backup retention`,
  },
];

const MaxVolumeSize = 1024 * 1024 * 1024 * 2; // 2GiB
const MinVolumeSize = 1024 * 1024 * 5; // 5MiB

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

@Component({
  selector: 'app-advanced-options-settings',
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    SparkleMenuComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleToggleComponent,
    SparkleSelectNewComponent,
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
  retentionOptions = signal(RETENTION_OPTIONS);
  volumeSizeSignal = toSignal(
    this.optionsForm.controls.remoteVolumeSize.get('size')?.valueChanges.pipe(debounceTime(300)) ?? of(null)
  );
  volumeUnitSignal = toSignal(
    this.optionsForm.controls.remoteVolumeSize.get('unit')?.valueChanges.pipe(debounceTime(300)) ?? of(null)
  );
  exceededVolumeSize = computed(() => {
    const currentSize = this.volumeSizeSignal() ?? this.optionsForm.controls.remoteVolumeSize.get('size')?.value;
    const currentUnit = this.volumeUnitSignal() ?? this.optionsForm.controls.remoteVolumeSize.get('unit')?.value;

    if (currentSize === null || currentSize === undefined || currentUnit === null || currentUnit === undefined) {
      return false;
    }

    const current = currentSize * Math.pow(1024, SIZE_OPTIONS.indexOf(currentUnit));
    return current > MaxVolumeSize || current < MinVolumeSize;
  });

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
    const items = this.retentionOptions();
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
