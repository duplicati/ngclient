import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { SizeComponent } from '../../core/components/size/size.component';
import { TimespanComponent } from '../../core/components/timespan/timespan.component';
import { BackupState } from '../backup.state';
import { OptionsListComponent } from './options-list/options-list.component';

export type RetentionType = 'all' | 'time' | 'versions' | 'smart' | 'custom';
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
const RETENTION_OPTIONS: { value: RetentionType; name: string }[] = [
  {
    value: 'all',
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

@Component({
  selector: 'app-advanced-options-settings',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    OptionsListComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleSelectComponent,
    SizeComponent,
    TimespanComponent,
    SparkleFormFieldComponent,
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

  selectedOptions = this.#backupState.selectedOptions;
  nonSelectedOptions = this.#backupState.nonSelectedOptions;
  isSubmitting = this.#backupState.isSubmitting;
  settings = this.#backupState.settings;
  optionsFields = this.#backupState.optionsFields;

  retentionOptions = signal(RETENTION_OPTIONS);

  sizeSplit = computed(() => {
    const value = this.optionsFields.remoteVolumeSize();
    const match = value.match(/^(\d+)(bytes|kb|mb|gb|tb|pb|b)$/i);

    return {
      value: match ? parseInt(match[1], 10) : 0,
      unit: match ? match[2].toUpperCase() : 'MB',
    };
  });

  exceededVolumeSize = computed(() => {
    const currentSize = this.sizeSplit().value;
    const currentUnit = this.sizeSplit().unit;

    if (currentSize === null || currentSize === undefined || currentUnit === null || currentUnit === undefined) {
      return false;
    }

    const current = currentSize * Math.pow(1024, SIZE_OPTIONS.indexOf(currentUnit));
    return current > MaxVolumeSize || current < MinVolumeSize;
  });

  goBack() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }

  submit() {
    this.#backupState.submit();
  }
}
