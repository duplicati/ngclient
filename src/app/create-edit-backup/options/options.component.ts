import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { startWith } from 'rxjs';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { ICommandLineArgument, SettingInputDto } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { CreateEditBackupState } from '../create-edit-backup.state';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const RETENTION_OPTIONS = ['Local folder', 'Local drive', 'Remote drive', 'Cloud drive'] as const;

type SizeOptions = (typeof SIZE_OPTIONS)[number];
type RetentionOptions = (typeof RETENTION_OPTIONS)[number];
type AdvancedOption = ReturnType<typeof createAdvancedOption>;

export const createOptionsForm = (
  defaults = {
    remoteVolumeSize: 0,
    size: 'GB' as SizeOptions,
    backupRetention: 'Local folder' as RetentionOptions,
    advancedOptions: [],
  }
) => {
  return fb.group({
    remoteVolumeSize: fb.group({
      size: fb.control<number>(defaults.remoteVolumeSize),
      unit: fb.control<SizeOptions>(defaults.size),
    }),
    backupRetention: fb.control<RetentionOptions>(defaults.backupRetention),
    advancedOptions: fb.array<AdvancedOption>([]),
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
    SparkleMenuComponent,
    SparkleSelectComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    ToggleCardComponent,
    JsonPipe,
  ],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OptionsComponent {
  #sysinfo = inject(SysinfoState);
  #createEditBackupState = inject(CreateEditBackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  optionsForm = this.#createEditBackupState.optionsForm;
  sizeOptions = signal(SIZE_OPTIONS);
  rentationOptions = signal(RETENTION_OPTIONS);
  selectionAdvancedOptions = toSignal(this.optionsForm.controls.advancedOptions.valueChanges.pipe(startWith([])));
  advancedOptions = signal<ICommandLineArgument[]>(this.#sysinfo.systemInfo()?.Options ?? []);

  nonSelectedAdvancedOptions = computed(() => {
    return this.advancedOptions().filter(
      (x) => this.selectionAdvancedOptions()?.findIndex((y) => y.name === x.Name) === -1
    );
  });

  addNewOption(option: ICommandLineArgument) {
    this.optionsForm.controls.advancedOptions.push(createAdvancedOption(option.Name, option.DefaultValue));
  }

  displayFn() {
    const items = this.advancedOptions();

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
    this.#createEditBackupState.submit();
  }
}
