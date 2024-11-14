import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  ArgumentType,
  BackupAndScheduleInputDto,
  BackupDto,
  DuplicatiServerService,
  ICommandLineArgument,
  IDynamicModule,
  ScheduleDto,
} from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { SysinfoState } from '../core/states/sysinfo.state';
import { createDestinationForm, createDestinationFormGroup, Size } from './destination/destination.component';
import { CustomFormView, DESTINATION_CONFIG, FormView } from './destination/destination.config';
import { DestinationFormGroup, fromTargetPath, toTargetPath } from './destination/destination.mapper';
import { createGeneralForm, NONE_OPTION } from './general/general.component';
import { createOptionsForm, SizeOptions } from './options/options.component';
import { createScheduleForm, Days, ScheduleFormValue } from './schedule/schedule.component';
import { createSourceDataForm } from './source-data/source-data.component';

const fb = new FormBuilder();

export type DestinationFormPair = {
  oauthField: string | null;
  custom: FormView[];
  dynamic: FormView[];
  advanced: FormView[];
};

type DestinationDefault = {
  custom: {
    [key: string]: any;
  };
  dynamic: {
    [key: string]: any;
  };
  advanced: {
    [key: string]: any;
  };
};

@Injectable({
  providedIn: 'root',
})
export class BackupState {
  #router = inject(Router);
  #sysinfo = inject(SysinfoState);
  #dupServer = inject(DuplicatiServerService);
  #timespanLiteralService = inject(TimespanLiteralsService);

  generalForm = createGeneralForm();
  sourceDataForm = createSourceDataForm();
  scheduleForm = createScheduleForm();
  destinationForm = createDestinationForm();
  optionsForm = createOptionsForm();

  isDraft = signal(false);
  backupId = signal<'new' | 'string' | null>(null);
  isSubmitting = signal(false);
  finishedLoading = signal(false);
  backupDefaults = signal<any>(null);
  isNew = computed(() => this.backupId() === 'new');

  selectedOptions = signal<FormView[]>([]);
  selectedAdvancedFormPair = signal<FormView[]>([]);
  destinationFormPair = signal<DestinationFormPair>({
    oauthField: null,
    custom: [],
    dynamic: [],
    advanced: [],
  });

  notSelectedAdvancedFormPair = computed<FormView[]>(() => {
    const advancedFormPairs = this.destinationFormPair()?.advanced ?? [];
    const selectedAdvancedFormPair = this.selectedAdvancedFormPair() ?? [];

    return advancedFormPairs.filter(
      (formPair) => selectedAdvancedFormPair.findIndex((pair) => pair.name === formPair.name) === -1
    );
  });

  selectedHttpOptions = signal<FormView[]>([]);
  notSelectedHttpOptions = computed<FormView[]>(() => {
    const httpOptions = this.httpOptions();
    const selectedHttpOptions = this.selectedHttpOptions() ?? [];

    return httpOptions.filter(
      (formPair) => selectedHttpOptions.findIndex((pair) => pair.name === formPair.name) === -1
    );
  });

  sourceDataFormSignal = toSignal(this.sourceDataForm.valueChanges);
  destinationFormSignal = toSignal(this.destinationForm.valueChanges);
  generalFormSignal = toSignal(this.generalForm.valueChanges);
  encryptionFieldSignal = toSignal(this.generalForm.controls.encryption.valueChanges);
  scheduleFormSignal = toSignal(this.scheduleForm.valueChanges);

  destinationOptions = computed(() => this.#sysinfo.backendModules() ?? []);
  httpOptions = computed(
    () =>
      this.#sysinfo
        .systemInfo()
        ?.GenericModules?.find((x) => x.Key === 'http-options')
        ?.Options?.map(this.#mapCommandLineArgumentsToFormViews) ?? []
  );
  advancedOptions = computed(() => {
    return this.#sysinfo.systemInfo()?.Options?.map(this.#mapCommandLineArgumentsToFormViews) ?? [];
  });

  #mapCommandLineArgumentsToFormViews(x: ICommandLineArgument) {
    return {
      name: x.Name as string,
      type: x.Type as ArgumentType,
      shortDescription: x.ShortDescription ?? undefined,
      longDescription: x.LongDescription ?? undefined,
      options: x.ValidValues,
    } as FormView;
  }
  encryptionOptions = computed(() => {
    const encryptionOptions = this.#sysinfo.systemInfo()?.EncryptionModules ?? [];
    return [NONE_OPTION, ...encryptionOptions];
  });

  nonSelectedOptions = computed(() => {
    return this.advancedOptions()
      .sort((a, b) => (a?.name && b?.name ? a?.name.localeCompare(b?.name) : 0))
      .filter((x) => this.selectedOptions()?.findIndex((y) => y.name === x.name) === -1);
  });

  addAdvancedFormPairByName(name: string, formArrayIndex: number, overrideDefaultValue?: any) {
    const item = this.notSelectedAdvancedFormPair().find((x) => x.name === name);

    if (!item) return;

    this.addAdvancedFormPair(item, formArrayIndex, overrideDefaultValue);
  }

  addHttpOptionByName(name: string, formArrayIndex: number, overrideDefaultValue?: any) {
    const item = this.notSelectedHttpOptions().find((x) => x.name === name);

    if (!item) return;

    this.addHttpOption(item, formArrayIndex, overrideDefaultValue);
  }

  addAdvancedFormPair(item: FormView, formArrayIndex: number, overrideDefaultValue?: any) {
    const group = this.destinationForm.controls.destinations.controls.at(formArrayIndex)?.controls.advanced!;
    const defaultValue = overrideDefaultValue ?? item.defaultValue;

    this.createFormField(group, item, defaultValue);

    this.selectedAdvancedFormPair.set([...this.selectedAdvancedFormPair(), item]);
  }

  addHttpOption(item: FormView, formArrayIndex: number, overrideDefaultValue?: any) {
    const group = this.destinationForm.controls.destinations.controls.at(formArrayIndex)?.controls.advanced!;
    const defaultValue = overrideDefaultValue ?? item.defaultValue;

    this.createFormField(group, item, defaultValue);

    this.selectedHttpOptions.set([...this.selectedHttpOptions(), item]);
  }

  removeAdvancedFormPair(item: FormView, formArrayIndex: number) {
    this.destinationForm.controls.destinations.controls.at(formArrayIndex)?.controls.advanced.removeControl(item.name);
    const isSelected = this.selectedAdvancedFormPair().findIndex((x) => x.name === item.name) !== -1;

    if (isSelected) {
      this.selectedAdvancedFormPair.update((y) => {
        y = y.filter((x) => x.name !== item.name);

        return y;
      });
    } else {
      this.selectedHttpOptions.update((y) => {
        y = y.filter((x) => x.name !== item.name);

        return y;
      });
    }
  }

  removeHttpOption(item: FormView, formArrayIndex: number) {
    this.destinationForm.controls.destinations.controls.at(formArrayIndex)?.controls.advanced.removeControl(item.name);
    this.selectedHttpOptions.update((y) => {
      y = y.filter((x) => x.name !== item.name);

      return y;
    });
  }

  submit() {
    this.isSubmitting.set(true);

    const backup = this.#mapFormsToBackup();
    const backupId = this.backupId();

    if (backupId === 'new' || !backupId || this.isDraft()) {
      this.#dupServer
        .postApiV1Backups({
          requestBody: backup,
        })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (res) => {
            console.log('submitted res', res);

            this.exit();
          },
          error: (err) => {
            console.error('submitted error', err);
          },
        });
    } else {
      this.#dupServer
        .putApiV1BackupById({
          id: backupId,
          requestBody: backup,
        })
        .pipe(finalize(() => this.isSubmitting.set(false)))
        .subscribe({
          next: (res) => {
            console.log('submitted res', res);

            this.exit();
          },
          error: (err) => {
            console.error('submitted error', err);
          },
        });
    }
  }

  exit() {
    // TODOS
    // - Are you sure dialog
    this.#resetAllForms();
    this.#router.navigate(['/']);
  }

  updateFieldsFromTargetUrl(targetUrl: string) {
    this.#clearDestinationForm();

    setTimeout(() => {
      this.#mapTargetUrlToDestinationForm(targetUrl);
    });
  }

  #clearDestinationForm() {
    this.destinationFormPair.set({
      oauthField: null,
      custom: [],
      dynamic: [],
      advanced: [],
    });
    this.selectedAdvancedFormPair.set([]);
    this.selectedHttpOptions.set([]);
    this.destinationForm.controls.destinations.clear();
    this.destinationForm.reset();
  }

  mapSourceDataToForm(backup: BackupDto) {
    const path = backup.Sources ?? '';
    const filters = backup.Filters?.map((x) => `${x.Include ? '' : '-'}${x.Expression}`) ?? [];
    const excludes = backup.Settings?.find((x) => x.Name === '--exclude-files-attributes')?.Value ?? '';
    const filesLargerThan = backup.Settings?.find((x) => x.Name === '--skip-files-larger-than') ?? null;

    const withNoDigits = (filesLargerThan?.Value!.replace(/[0-9]/g, '') as Size) ?? null;
    const onlyDigits = filesLargerThan?.Value!.replace(/[^0-9]/g, '') ?? null;

    const sourceObj = {
      path: [...path, ...filters].join('\0'),
      excludes: {
        hiddenFiles: excludes.includes('hidden'),
        systemFiles: excludes.includes('system'),
        tempFiles: excludes.includes('temporary'),
        filesLargerThan:
          withNoDigits && onlyDigits
            ? {
                size: parseInt(onlyDigits),
                unit: withNoDigits.toUpperCase(),
              }
            : null,
      },
    };

    this.sourceDataForm.patchValue(sourceObj as any);
  }

  mapDestinationToForm(backup: BackupDto) {
    const targetUrlData = backup.TargetURL ? fromTargetPath(backup.TargetURL) : null;

    if (targetUrlData) {
      const createAdvancedFormFields = true;

      this.addDestinationFormGroup(
        targetUrlData.destinationType,
        {
          custom: targetUrlData.custom,
          dynamic: targetUrlData.dynamic,
          advanced: targetUrlData.advanced,
        },
        createAdvancedFormFields
      );
    }
  }

  #mapTargetUrlToDestinationForm(targetUrl: string) {
    const targetUrlData = fromTargetPath(targetUrl);

    if (targetUrlData) {
      const createAdvancedFormFields = true;

      this.addDestinationFormGroup(
        targetUrlData.destinationType,
        {
          custom: targetUrlData.custom,
          dynamic: targetUrlData.dynamic,
          advanced: targetUrlData.advanced,
        },
        createAdvancedFormFields
      );
    }
  }

  mapGeneralToForm(backup: BackupDto) {
    const encryptionModule = backup.Settings?.find((x) => x.Name === 'encryption-module');
    const encryption = encryptionModule?.Value && encryptionModule.Value.length ? encryptionModule.Value : '';

    const baseUpdate: Partial<typeof this.generalForm.value> = {
      name: backup.Name ?? '',
      description: backup.Description ?? '',
    };

    if (encryption && encryption !== '') {
      baseUpdate.encryption = encryption;
    }
    this.generalForm.patchValue(baseUpdate);
  }

  mapScheduleToForm(schedule: ScheduleDto | null) {
    if (!schedule) {
      this.scheduleForm.patchValue({
        autoRun: true,
      });

      return;
    }

    const res = this.#timespanLiteralService.fromString(schedule.Repeat) ?? null;
    const nextTime = this.#evaluateTimeString(schedule.Time);

    const patchObj: ScheduleFormValue = {
      nextTime,
      runAgain: {
        repeatValue: res?.value ?? 1,
        repeatUnit: res?.unit ?? 'D',
        allowedDays: {
          mon: schedule.AllowedDays?.includes('mon') ?? false,
          tue: schedule.AllowedDays?.includes('tue') ?? false,
          wed: schedule.AllowedDays?.includes('wed') ?? false,
          thu: schedule.AllowedDays?.includes('thu') ?? false,
          fri: schedule.AllowedDays?.includes('fri') ?? false,
          sat: schedule.AllowedDays?.includes('sat') ?? false,
          sun: schedule.AllowedDays?.includes('sun') ?? false,
        },
      },
    };

    this.scheduleForm.patchValue(patchObj);
  }

  mapOptionsToForms(backup: BackupDto) {
    const modulesToIgnore = ['--no-encryption', '--exclude-files-attributes', '--skip-files-larger-than'];
    const advancedOptions = this.advancedOptions();

    backup.Settings?.forEach((x) => {
      if (x.Name === 'encryption-module') {
        return this.generalForm.controls.encryption.setValue(x.Value ?? '');
      }

      if (x.Name && modulesToIgnore.includes(x.Name)) return;

      if (x.Name === 'dblock-size') {
        const size = x.Value?.replace(/[^0-9]/g, '');
        const unit = x.Value?.replace(/[0-9]/g, '');

        return this.optionsForm.controls.remoteVolumeSize.setValue({
          size: size ? parseInt(size) : null,
          unit: unit ? (unit.toUpperCase() as SizeOptions) : null,
        });
      }

      if (x.Name && x.Value) {
        const option = advancedOptions.find((y) => y.name === x.Name);

        if (!option) return;

        this.addOptionToFormGroup(option, x.Value);
      }
    });
  }

  getCurrentTargetUrl() {
    return this.#getTargetUrl(this.destinationForm.controls.destinations as any);
  }

  #mapFormsToBackup() {
    const generalFormValue = this.generalForm.value;
    const optionsFormValue = this.optionsForm.value;
    const scheduleFormValue = this.scheduleForm.value;
    const sourceDataFormValue = this.sourceDataForm.value;
    const destinationFormValue = this.destinationForm.value;

    const targetUrl = destinationFormValue.destinations?.length
      ? this.#getTargetUrl(this.destinationForm.controls.destinations as any)
      : [];

    let scheduleRepeat: string | null = null;

    if (scheduleFormValue.runAgain?.repeatUnit && scheduleFormValue.runAgain?.repeatValue) {
      scheduleRepeat = this.#timespanLiteralService.toString(
        scheduleFormValue.runAgain.repeatValue,
        scheduleFormValue.runAgain.repeatUnit
      );
    }

    const allowedDays = scheduleFormValue.runAgain?.allowedDays
      ? Object.entries(scheduleFormValue.runAgain?.allowedDays)
          .filter(([_, status]) => status)
          .map(([day, _]) => day as Days)
      : [];

    const pathFilters = sourceDataFormValue.path?.split('\0') ?? [];

    const encryption =
      generalFormValue.encryption === ''
        ? {
            Name: '--no-encryption',
            Value: 'True',
          }
        : {
            Name: 'encryption-module',
            Value: generalFormValue.encryption ?? null,
          };

    const advancedOptions = this.advancedOptions();
    const mappedAdvancedOptions = Object.entries(optionsFormValue.advancedOptions ?? {})
      .filter(([key, value]) => key && value)
      .map(([key, value]) => {
        const option = advancedOptions.find((y) => y.name === key);

        if (option?.type === 'Size') {
          return {
            Name: key,
            Value: `${(value as any).size}${(value as any).unit.toLowerCase()}`,
          };
        }

        if (option?.type === 'Integer') {
          return {
            Name: key,
            Value: (value as number).toString(),
          };
        }

        if (option?.type === 'Boolean') {
          return {
            Name: key,
            Value: (value as boolean).toString(),
          };
        }

        return {
          Name: key,
          Value: value,
        };
      });

    const settings = [encryption, ...mappedAdvancedOptions];

    const excludes = Object.entries(sourceDataFormValue.excludes ?? {})
      .filter(([key, val]) => val && key !== 'filesLargerThan')
      .map(([key]) => key);

    const filesLargerThan = sourceDataFormValue.excludes?.filesLargerThan;

    if (excludes.length) {
      settings.push({
        Name: '--exclude-files-attributes',
        Value: excludes.join(','),
      });
    }
    if (filesLargerThan && filesLargerThan.size !== null && filesLargerThan.unit !== null) {
      settings.push({
        Name: '--skip-files-larger-than',
        Value: `${filesLargerThan.size}${filesLargerThan.unit}`,
      });
    }

    return <BackupAndScheduleInputDto>{
      Backup: {
        Name: generalFormValue.name,
        Description: generalFormValue.description,
        TargetURL: targetUrl[0] ?? null,
        Sources: pathFilters.filter((x) => !x.startsWith('-')),
        Settings: settings,
        Filters: pathFilters
          .filter((x) => x.startsWith('-'))
          .map((x, index) => ({
            Order: index,
            Include: false,
            Expression: x.slice(1),
          })),
      },
      Schedule: scheduleFormValue.autoRun
        ? null
        : {
            Repeat: scheduleRepeat,
            Time: scheduleFormValue.nextTime?.date
              ? new Date(
                  `${scheduleFormValue.nextTime.date}T${scheduleFormValue.nextTime?.time || '00:00:00'}`
                ).toISOString()
              : null,
            AllowedDays: allowedDays,
          },
      // ExtraOptions: {
      //   BackupID: this.backupId(),
      //   Operation: this.backupId() ? 'Update' : 'Create',
      // },
    };
  }

  #getTargetUrl(destinationFormArray: FormArray<DestinationFormGroup>) {
    return destinationFormArray.controls.map((control) => toTargetPath(control.value));
  }

  #evaluateTimeString(t: string | undefined) {
    if (!t || t?.indexOf('T') === -1) {
      return {
        time: t ?? '13:00',
      };
    }

    const date = new Date(t);
    const newObj: ScheduleFormValue['nextTime'] = {
      time: `${('' + date.getHours()).padStart(2, '0')}:${('' + date.getMinutes()).padStart(2, '0')}`,
    };

    if (t.indexOf('T') !== -1) {
      newObj.date = date.toISOString().split('T')[0];
    }

    return newObj;
  }

  removeOptionFromFormGroup(option: FormView) {
    const optionName = option.name;

    if (!optionName) return;

    this.optionsForm.controls.advancedOptions.removeControl(optionName);
    this.selectedOptions.update((y) => {
      y = y.filter((x) => x.name !== optionName);

      return y;
    });
  }

  addOptionToFormGroup(option: FormView, defaultValueOverride?: string) {
    const group = this.optionsForm.controls.advancedOptions;

    this.createFormField(group, option, defaultValueOverride ?? option.defaultValue);
    this.selectedOptions.update((y) => {
      y.push(option);

      return y;
    });
  }

  createFormField(group: FormGroup, element: FormView, defaultValue?: any) {
    if (
      element.type === 'String' ||
      element.type === 'FileTree' ||
      element.type === 'FolderTree' ||
      element.type === 'Password' ||
      element.type === 'Enumeration' ||
      element.type === 'Path'
    ) {
      group.addControl(element.name as string, fb.control(defaultValue));
      return;
    }

    if (element.type === 'Size') {
      const withNoDigits = defaultValue!.replace(/[0-9]/g, '') as Size | undefined;
      const onlyDigits = defaultValue!.replace(/[^0-9]/g, '');

      group.addControl(
        element.name as string,
        fb.group({
          size: fb.control<number>(onlyDigits ? parseInt(onlyDigits) : 50),
          unit: fb.control<string>(withNoDigits ? withNoDigits.toUpperCase() : 'MB'),
        })
      );
      return;
    }

    if (element.type === 'Integer') {
      group.addControl(element.name as string, fb.control<number>(defaultValue ? parseInt(defaultValue) : 0));
      return;
    }

    if (element.type === 'Boolean') {
      group.addControl(element.name as string, fb.control(defaultValue === 'true'));
      return;
    }

    if (element.type === 'Flags') {
      group.addControl(element.name as string, fb.control<string>(defaultValue ?? ''));
      return;
    }

    if (element.type === 'Timespan') {
      group.addControl(
        element.name as string,
        fb.control<string>(defaultValue as string, [Validators.pattern(/([-+]?\d{1,3}[smhDWMY])+/)])
      );
      return;
    }
  }

  addDestinationFormGroup(key: IDynamicModule['Key'], defaults?: DestinationDefault, createAdvancedFormFields = false) {
    const item = this.destinationOptions().find((x) => x.Key === key);
    const httpOptions = this.httpOptions();

    if (!item || !item.Options) return;

    const destinationConfig = DESTINATION_CONFIG.hasOwnProperty(key as string) && DESTINATION_CONFIG[key as string];
    const oauthField = destinationConfig && destinationConfig.oauthField ? destinationConfig.oauthField : null;
    const customFields = destinationConfig && destinationConfig.customFields ? destinationConfig.customFields : {};
    const dynamicFields = destinationConfig && destinationConfig.dynamicFields ? destinationConfig.dynamicFields : [];
    const advancedFields =
      destinationConfig && destinationConfig.advancedFields ? destinationConfig.advancedFields : [];
    const ignoredAdvancedFields =
      destinationConfig && destinationConfig.ignoredAdvancedFields ? destinationConfig.ignoredAdvancedFields : [];

    this.destinationFormPair.set({
      oauthField,
      custom: [],
      dynamic: [],
      advanced: [],
    });

    const customGroup = fb.group({});
    const dynamicGroup = fb.group({});
    const advancedGroup = fb.group({});

    if (customFields) {
      Object.entries(customFields).forEach(([key, field], index) => {
        const { formElement, ...val } = field;

        customGroup.addControl(key, formElement(defaults?.custom[key]));

        this.destinationFormPair.update((y) => {
          y.custom.push({ order: 900 + index, ...val });

          return y;
        });
      });
    }

    for (let index = 0; index < item.Options.length; index++) {
      const element = item.Options[index];

      if (element.Deprecated) continue;

      const asDynamic = dynamicFields.find((x) => x === element.Name || (x as CustomFormView).name === element.Name);

      if (asDynamic) {
        const overwriting = asDynamic && typeof asDynamic !== 'string';
        const newField = {
          name: element.Name as string,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
          order: 900 + index,
        };

        const patchedNewField = overwriting
          ? {
              ...newField,
              ...asDynamic,
            }
          : newField;

        const passedDefaultValue = defaults?.dynamic[element.Name as string];
        const defaultValue = passedDefaultValue ?? element.DefaultValue;

        this.createFormField(dynamicGroup, patchedNewField, defaultValue);

        this.destinationFormPair.update((y) => {
          y.dynamic.push(patchedNewField);

          return y;
        });
      } else {
        const ignored = ignoredAdvancedFields.find((x) => x === element.Name);

        if (ignored) continue;

        const asAdvanced = advancedFields.find(
          (x) => x === element.Name || (x as CustomFormView).name === element.Name
        );
        const overwriting = asAdvanced && typeof asAdvanced !== 'string';
        const passedDefaultValue = defaults?.advanced[element.Name as string];
        const defaultValue = passedDefaultValue ?? element.DefaultValue;
        const newField = {
          name: element.Name as string,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
          defaultValue: defaultValue,
          order: 900 + index,
        };

        const patchedNewField = overwriting
          ? {
              ...newField,
              ...asAdvanced,
            }
          : newField;

        if (createAdvancedFormFields && passedDefaultValue) {
          this.createFormField(advancedGroup, patchedNewField, defaultValue);
          this.selectedAdvancedFormPair.update((y) => {
            y.push(patchedNewField);

            return y;
          });
        }

        this.destinationFormPair.update((y) => {
          y.advanced.push(patchedNewField);

          return y;
        });
      }
    }

    for (let index = 0; index < httpOptions.length; index++) {
      const element = httpOptions[index];

      const passedDefaultValue = defaults?.advanced[element.name as string];
      const defaultValue = passedDefaultValue ?? element.defaultValue;

      if (createAdvancedFormFields && passedDefaultValue) {
        this.createFormField(advancedGroup, element, defaultValue);
        this.selectedHttpOptions.update((y) => {
          y.push(element);
          return y;
        });
      }
    }

    this.destinationFormPair.update((y) => ({
      oauthField: y.oauthField,
      custom: y.custom.sort((a, b) => a.order! - b.order!),
      dynamic: y.dynamic.sort((a, b) => a.order! - b.order!),
      advanced: y.advanced.sort((a, b) => a.order! - b.order!),
    }));

    this.destinationForm.controls.destinations.push(
      createDestinationFormGroup({
        key: item.Key as string,
        customGroup,
        dynamicGroup,
        advancedGroup,
      })
    );
  }

  #resetAllForms() {
    this.generalForm.reset();
    this.destinationForm.controls.destinations.clear();
    this.destinationForm.reset();
    this.sourceDataForm.reset();
    this.scheduleForm.reset();
    this.optionsForm.reset();
  }
}
