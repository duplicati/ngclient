import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs';
import {
  ArgumentType,
  BackupAndScheduleInputDto,
  BackupDto,
  DuplicatiServerService,
  GetBackupResultDto,
  IDynamicModule,
  ScheduleDto,
} from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { BackupsState } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { createDestinationForm, createDestinationFormGroup, Size } from './destination/destination.component';
import { DESTINATION_CONFIG, FormView } from './destination/destination.config';
import { DestinationFormGroup, fromTargetPath, toTargetPath } from './destination/destination.mapper';
import { createGeneralForm, NONE_OPTION } from './general/general.component';
import { createAdvancedOption, createOptionsForm } from './options/options.component';
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
  #backupsState = inject(BackupsState);

  destinationOptions = this.#sysinfo.backendModules;

  isDraft = signal(false);
  backupId = signal<'new' | 'string' | null>(null);
  isSubmitting = signal(false);
  loadingBackup = signal(false);
  loadingDefaults = signal(true);
  destinationIsLoaded = signal(false);
  isNew = computed(() => this.backupId() === 'new');
  backupDefaults = signal<any>(null);
  generalForm = createGeneralForm();
  sourceDataForm = createSourceDataForm();
  scheduleForm = createScheduleForm();
  destinationForm = createDestinationForm();
  optionsForm = createOptionsForm();

  selectedAdvancedFormPair = signal<FormView[]>([]);
  notSelectedAdvancedFormPair = signal<FormView[]>([]);
  destinationFormPair = signal<DestinationFormPair>({
    oauthField: null,
    custom: [],
    dynamic: [],
    advanced: [],
  });
  sourceDataFormSignal = toSignal(this.sourceDataForm.valueChanges);
  destinationFormSignal = toSignal(this.destinationForm.valueChanges);
  encryptionFieldSignal = toSignal(this.generalForm.controls.encryption.valueChanges);
  scheduleFormSignal = toSignal(this.scheduleForm.valueChanges);
  encryptionOptions = computed(() => {
    const encryptionOptions = this.#sysinfo.systemInfo()?.EncryptionModules ?? [];
    return [NONE_OPTION, ...encryptionOptions];
  });

  init(id: 'new' | 'string' = 'new', isDraft = false) {
    this.backupId.set(id);

    if (id !== 'new') {
      this.getBackup(id, isDraft);
    } else {
      this.getDefaults();
    }
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

  getDefaults() {
    this.loadingDefaults.set(true);

    this.#dupServer
      .getApiV1Backupdefaults()
      .pipe(
        take(1),
        finalize(() => this.loadingDefaults.set(false))
      )
      .subscribe({
        next: (res: any) => {
          this.#mapScheduleToForm(res.Schedule);
          this.#mapOptionsToForms(res.Backup);
          this.backupDefaults.set(res);
          this.destinationIsLoaded.set(true);
        },
      });
  }

  getBackup(id: string, isDraft = false) {
    this.loadingBackup.set(true);

    const onBackup = (res: GetBackupResultDto) => {
      this.#mapScheduleToForm(res.Schedule ?? null);

      if (res.Backup) {
        this.#mapGeneralToForm(res.Backup);
        this.#mapDestinationToForm(res.Backup);
        this.#mapSourceDataToForm(res.Backup);
        this.#mapOptionsToForms(res.Backup);
      }

      this.destinationIsLoaded.set(true);
    };

    if (isDraft) {
      this.isDraft.set(isDraft);

      const backup = this.#backupsState.draftBackups().find((x) => x.id === id);

      if (!backup) {
        this.loadingBackup.set(false);

        // TODO alert the user

        alert('Backup not found');
        return;
      }

      onBackup(backup.data);
    } else {
      this.#dupServer
        .getApiV1BackupById({
          id,
        })
        .pipe(finalize(() => this.loadingBackup.set(false)))
        .subscribe({
          next: onBackup,
        });
    }
  }

  #mapSourceDataToForm(backup: BackupDto) {
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

  #mapDestinationToForm(backup: BackupDto) {
    const targetUrlData = backup.TargetURL ? fromTargetPath(backup.TargetURL) : null;

    if (targetUrlData) {
      this.addDestinationFormGroup(targetUrlData.destinationType, {
        custom: targetUrlData.custom,
        dynamic: targetUrlData.dynamic,
        advanced: targetUrlData.advanced,
      });
    }
  }

  #mapGeneralToForm(backup: BackupDto) {
    const encryptionModule = backup.Settings?.find((x) => x.Name === 'encryption-module');
    const encryption = encryptionModule?.Value && encryptionModule.Value.length ? encryptionModule.Value : 'none';

    this.generalForm.patchValue({
      name: backup.Name ?? '',
      description: backup.Description ?? '',
      encryption,
    });
  }

  #mapScheduleToForm(schedule: ScheduleDto | null) {
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

  #mapOptionsToForms(backup: BackupDto) {
    const modulesToIgnore = ['--no-encryption', '--exclude-files-attributes', '--skip-files-larger-than'];
    backup.Settings?.forEach((x) => {
      if (x.Name === 'encryption-module') {
        return this.generalForm.controls.encryption.setValue(x.Value ?? 'None');
      }

      if (x.Name && modulesToIgnore.includes(x.Name)) return;

      if (x.Name && x.Value) {
        this.optionsForm.controls.advancedOptions.push(createAdvancedOption(x.Name, x.Value));
      }
    });
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
    const advancedOptions =
      optionsFormValue.advancedOptions?.map((x) => ({
        Name: x.name ?? null,
        Value: x.value && x.value.length ? x.value.toString() : null,
      })) ?? [];

    const encryption =
      generalFormValue.encryption === 'none'
        ? {
            Name: '--no-encryption',
            Value: 'True',
          }
        : {
            Name: 'encryption-module',
            Value: generalFormValue.encryption ?? null,
          };

    const settings = [encryption, ...advancedOptions.filter((x) => x.Name && x.Value)];
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
    return destinationFormArray.controls.map((control) => {
      if (!control.controls['advanced']) return toTargetPath(control.value);

      const dirtyFields = Object.keys(control.controls['advanced'].controls).filter(
        (controlName) => control.controls['advanced'].controls[controlName].dirty
      );

      return toTargetPath({
        ...control.value,
        advanced: dirtyFields.reduce((acc, key) => {
          // @ts-ignore
          acc[key] = control.controls['advanced'].controls[key].value;
          return acc;
        }, {}),
      });
    });
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

  addDestinationFormGroup(key: IDynamicModule['Key'], defaults?: DestinationDefault) {
    const item = this.destinationOptions().find((x) => x.Key === key);

    if (!item || !item.Options) return;

    const destinationConfig = DESTINATION_CONFIG.hasOwnProperty(key as string) && DESTINATION_CONFIG[key as string];
    const customFields = destinationConfig && destinationConfig.customFields ? destinationConfig.customFields : {};
    const dynamicFields = destinationConfig && destinationConfig.dynamicFields ? destinationConfig.dynamicFields : [];
    const advancedFields =
      destinationConfig && destinationConfig.advancedFields ? destinationConfig.advancedFields : [];
    const oauthField = destinationConfig && destinationConfig.oauthField ? destinationConfig.oauthField : null;

    this.destinationFormPair.set({
      oauthField,
      custom: [],
      dynamic: [],
      advanced: [],
    });
    this.selectedAdvancedFormPair.set([]);

    const customGroup = fb.group({});
    const dynamicGroup = fb.group({});
    const advancedGroup = fb.group({});

    if (customFields) {
      for (key in customFields) {
        const { formElement, ...val } = customFields[key];

        customGroup.addControl(key, formElement(defaults?.custom[key]));

        this.destinationFormPair.update((y) => {
          y.custom.push(val);

          return y;
        });
      }
    }

    for (let index = 0; index < item.Options.length; index++) {
      const element = item.Options[index];

      if (element.Deprecated) continue;

      const isDynamic = dynamicFields.includes(element.Name as string);
      const group = isDynamic ? dynamicGroup : advancedGroup;

      this.destinationFormPair.update((y) => {
        y[isDynamic ? 'dynamic' : 'advanced'].push({
          name: element.Name as string,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
        });

        return y;
      });

      const passedDefaultValue = isDynamic
        ? defaults?.dynamic[element.Name as string]
        : defaults?.advanced[element.Name as string];
      const defaultValue = passedDefaultValue ?? element.DefaultValue;

      if (
        element.Type === 'String' ||
        element.Type === 'Password' ||
        element.Type === 'Enumeration' ||
        element.Type === 'Path'
      ) {
        group.addControl(element.Name as string, fb.control(defaultValue));

        continue;
      }

      if (element.Type === 'Size') {
        const withNoDigits = defaultValue!.replace(/[0-9]/g, '') as Size | undefined;
        const onlyDigits = defaultValue!.replace(/[^0-9]/g, '');

        group.addControl(
          element.Name as string,
          fb.group({
            size: fb.control<number>(onlyDigits ? parseInt(onlyDigits) : 50),
            unit: fb.control<string>(withNoDigits ? withNoDigits.toUpperCase() : 'MB'),
          })
        );
      }

      if (element.Type === 'Integer') {
        group.addControl(element.Name as string, fb.control<number>(defaultValue ? parseInt(defaultValue) : 0));

        continue;
      }

      if (element.Type === 'Boolean') {
        group.addControl(element.Name as string, fb.control(defaultValue === 'true'));

        continue;
      }

      if (element.Type === 'Flags') {
        group.addControl(element.Name as string, fb.control<string>(defaultValue ?? ''));

        continue;
      }

      if (element.Type === 'Timespan') {
        group.addControl(
          element.Name as string,
          fb.control<string>(defaultValue as string, [Validators.pattern(/([-+]?\d{1,3}[smhDWMY])+/)])
        );
      }
    }

    if (this.destinationForm.controls.destinations.length !== 0) {
      this.destinationForm.controls.destinations.removeAt(0);
    }

    this.destinationFormPair.update((y) => ({
      oauthField: y.oauthField,
      custom: y.custom,
      dynamic: y.dynamic.sort((a, b) => dynamicFields.indexOf(a.name) - dynamicFields.indexOf(b.name)),
      advanced: y.advanced.sort((a, b) => {
        const indexA = advancedFields.indexOf(a.name);
        const indexB = advancedFields.indexOf(b.name);
        if (indexA === -1 && indexB !== -1) {
          return 1; // Move `a` to the back
        } else if (indexA !== -1 && indexB === -1) {
          return -1; // Move `b` to the back
        }

        return indexA - indexB;
      }),
    }));

    this.notSelectedAdvancedFormPair.set(this.destinationFormPair().advanced);
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
    this.sourceDataForm.reset();
    this.scheduleForm.reset();
    this.destinationForm.reset();
    this.optionsForm.reset();
  }
}
