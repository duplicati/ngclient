import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButtonComponent, ShipFormFieldComponent, ShipIconComponent, ShipSelectComponent } from '@ship-ui/core';
import { SIZE_OPTIONS, SizeComponent, splitSize } from '../../core/components/size/size.component';
import { TimespanComponent } from '../../core/components/timespan/timespan.component';
import { BackupState } from '../backup.state';
import { OptionsListComponent } from './options-list/options-list.component';

export type RetentionType = 'all' | 'time' | 'versions' | 'smart' | 'custom';

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

    OptionsListComponent,
    SizeComponent,
    TimespanComponent,

    ShipButtonComponent,
    ShipIconComponent,
    ShipSelectComponent,
    ShipFormFieldComponent,
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

  isSubmitting = this.#backupState.isSubmitting;
  settings = this.#backupState.settings;
  optionsFields = this.#backupState.optionsFields;
  applicationOptions = this.#backupState.applicationOptions;

  retentionOptions = signal(RETENTION_OPTIONS);
  exceededVolumeSize = computed(() => {
    const { size, unit } = splitSize(this.optionsFields.remoteVolumeSize());

    if (size === null || size === undefined || unit === null || unit === undefined) {
      return false;
    }

    const current =
      size *
      Math.pow(
        1024,
        SIZE_OPTIONS.findIndex((x) => x.value === unit)
      );
    return current > MaxVolumeSize || current < MinVolumeSize;
  });

  goBack() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }

  submit() {
    this.#backupState.submit();
  }
}
