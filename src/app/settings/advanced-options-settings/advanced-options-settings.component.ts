import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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
import { finalize } from 'rxjs';
import { BackupState } from '../../backup/backup.state';
import { FormView } from '../../backup/destination/destination.config-utilities';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { DuplicatiServerService } from '../../core/openapi';
import { ServerSettingsService } from '../server-settings.service';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
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
] as const;

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
  templateUrl: './advanced-options-settings.component.html',
  styleUrl: './advanced-options-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class AdvancedOptionsSettingsComponent {
  #backupState = inject(BackupState);
  #serverSettingsService = inject(ServerSettingsService);
  #dupServer = inject(DuplicatiServerService);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  optionsForm = this.#backupState.optionsForm;
  selectedOptions = this.#backupState.selectedOptions;
  nonSelectedOptions = this.#backupState.nonSelectedOptions;
  isSubmitting = signal(false);
  isLoadingOptions = signal(true);
  sizeOptions = signal(SIZE_OPTIONS);
  serverSettingsEffect = effect(() => {
    const serverSettings = this.#serverSettingsService.serverSettings();

    if (serverSettings === undefined) return;

    this.isLoadingOptions.set(true);

    const availableOptions = this.#backupState.nonSelectedOptions();
    const entries = Object.entries(serverSettings);
    entries.forEach(([key, value], index) => {
      if (key.startsWith('--')) {
        const formControlName = key.replace('--', '');
        const option = availableOptions.find((option) => option.name === formControlName);

        if (option !== undefined) {
          this.addNewOption(option, value);
        } else {
          this.addFreeTextOption(formControlName, value);
        }
      }

      if (index === entries.length - 1) {
        this.isLoadingOptions.set(false);
      }
    });
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

  removeFormView(option: FormView) {
    const key = '--' + option.name;
    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          [key]: null,
        },
      })
      .subscribe({
        next: (res) => {
          window.location.reload();
        },
      });
  }

  addNewOption(option: FormView, defaultValue?: any) {
    this.#backupState.addOptionToFormGroup(option, defaultValue);
  }

  addFreeTextOption(name: string, value: string) {
    this.#backupState.addFreeTextOption(name, value, {
      // shortDescription: 'Free text',
      // longDescription: 'Free text',
    });
  }

  submit() {
    this.isSubmitting.set(true);

    const advancedOptions = this.optionsForm.value.advancedOptions;

    if (!advancedOptions) return;

    const mappedAdvancedOptions = this.#prefixKeysWithDashes(advancedOptions!);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: mappedAdvancedOptions,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe();
  }

  #prefixKeysWithDashes(obj: Record<string, any>) {
    let newObj: Record<string, any> = {};
    for (const key in obj) {
      newObj[`--${key}`] = obj[key];
    }
    return newObj;
  }
}
