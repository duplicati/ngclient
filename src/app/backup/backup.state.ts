import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SparkleDialogService } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import {
  ArgumentType,
  BackupAndScheduleInputDto,
  BackupDto,
  DuplicatiServerService,
  ICommandLineArgument,
  ScheduleDto,
  SettingDto,
  SettingInputDto,
} from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { SysinfoState } from '../core/states/sysinfo.state';
import { FormView } from './destination/destination.config-utilities';
import { createGeneralForm, NONE_OPTION } from './general/general.component';
import { RetentionType } from './options/options.component';
import { Days, SCHEDULE_FIELD_DEFAULTS } from './schedule/schedule.component';
import { createSourceDataForm } from './source-data/source-data.component';

const SMART_RETENTION = '1W:1D,4W:1W,12M:1M';

@Injectable({
  providedIn: 'root',
})
export class BackupState {
  #router = inject(Router);
  #sysinfo = inject(SysinfoState);
  #dialog = inject(SparkleDialogService);
  #dupServer = inject(DuplicatiServerService);
  #timespanLiteralService = inject(TimespanLiteralsService);

  generalForm = createGeneralForm();
  sourceDataForm = createSourceDataForm();
  scheduleFields = {
    autoRun: signal(SCHEDULE_FIELD_DEFAULTS.autoRun),
    nextTime: signal<Partial<typeof SCHEDULE_FIELD_DEFAULTS.nextTime>>(SCHEDULE_FIELD_DEFAULTS.nextTime),
    runAgain: signal(SCHEDULE_FIELD_DEFAULTS.runAgain),
  };
  settings = signal<SettingInputDto[]>([]);
  optionsFields = {
    remoteVolumeSize: signal('50MB'),
    backupRetention: signal<RetentionType>('all'),
    backupRetentionTime: signal(''),
    backupRetentionVersions: signal<number | null>(0),
    backupRetentionCustom: signal(''),
  };

  targetUrlModel = signal<string | null>(null);

  isDraft = signal(false);
  backupId = signal<'new' | 'string' | null>(null);
  backupName = computed(() => this.generalFormSignal()?.name ?? '');
  isSubmitting = signal(false);
  finishedLoading = signal(false);
  backupDefaults = signal<Record<string, string> | null>(null);
  applicationOptions = signal<SettingDto[] | null>(null);
  isNew = computed(() => this.backupId() === 'new');
  osType = computed(() => this.#sysinfo.systemInfo()?.OSType);

  selectedOptions = signal<FormView[]>([]);

  sourceDataFormSignal = toSignal(this.sourceDataForm.valueChanges);
  generalFormSignal = toSignal(this.generalForm.valueChanges);
  encryptionFieldSignal = toSignal(this.generalForm.controls.encryption.valueChanges);

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

  submit(withoutExit = false) {
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
            if (!withoutExit) this.exit(false);
          },
          error: (err) => {},
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
            if (!withoutExit) this.exit(false);
          },
          error: (err) => {},
        });
    }
  }

  exit(confirm: boolean) {
    if (!confirm) {
      this.#resetAllForms();
      this.#router.navigate(['/']);
      return;
    }

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm exit?`,
        message: $localize`Are you sure you want to exit?`,
        confirmText: $localize`Yes`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;

        this.#resetAllForms();
        this.#router.navigate(['/']);
      },
    });
  }

  mapSourceDataToForm(backup: BackupDto) {
    const path = backup.Sources ?? '';
    const filters = backup.Filters?.map((x) => `${x.Include ? '' : '-'}${x.Expression}`) ?? [];
    const excludes = backup.Settings?.find((x) => x.Name === '--exclude-files-attributes')?.Value ?? '';
    const filesLargerThan = backup.Settings?.find((x) => x.Name === '--skip-files-larger-than') ?? null;

    const sourceObj = {
      path: [...path, ...filters].join('\0'),
      excludes: {
        hiddenFiles: excludes.includes('hidden'),
        systemFiles: excludes.includes('system'),
        tempFiles: excludes.includes('temporary'),
        filesLargerThan: filesLargerThan?.Value?.toUpperCase() ?? null,
      },
    };

    this.sourceDataForm.patchValue(sourceObj as any);
  }

  mapDestinationToForm(backup: BackupDto) {
    this.targetUrlModel.set(backup.TargetURL ?? '');
  }

  mapGeneralToForm(backup: BackupDto) {
    const encryptionModule = backup.Settings?.find((x) => x.Name === 'encryption-module');
    const passphrase = backup.Settings?.find((x) => x.Name === 'passphrase')?.Value ?? '';
    const encryption = encryptionModule?.Value && encryptionModule.Value.length ? encryptionModule.Value : '';

    const baseUpdate: Partial<typeof this.generalForm.value> = {
      name: backup.Name ?? '',
      description: backup.Description ?? '',
    };

    if (encryption && encryption !== '') {
      baseUpdate.encryption = encryption;
    }

    if (passphrase && passphrase !== '') {
      baseUpdate.password = passphrase;
      baseUpdate.repeatPassword = passphrase;
    }

    this.generalForm.patchValue(baseUpdate);
  }

  mapScheduleToForm(schedule: ScheduleDto | null) {
    if (!schedule) {
      this.scheduleFields.autoRun.set(false);

      return;
    }

    const res = this.#timespanLiteralService.fromString(schedule.Repeat) ?? null;
    const nextTime = this.#evaluateTimeString(schedule.Time);

    this.scheduleFields.autoRun.set(true);
    this.scheduleFields.nextTime.update((x) => ({ ...x, ...nextTime }));
    this.scheduleFields.runAgain.set({
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
    });
  }

  mapOptionsToForms(backup: BackupDto) {
    const modulesToIgnore = [
      '--no-encryption',
      '--exclude-files-attributes',
      '--skip-files-larger-than',
      'dblock-size',
      'passphrase',
      'keep-time',
      'keep-versions',
      'retention-policy',
    ];

    const modulesWithoutIgnored = backup.Settings?.filter((x) => !modulesToIgnore.includes(x.Name!));
    const ignoredModules = backup.Settings?.filter((x) => modulesToIgnore.includes(x.Name!));

    this.settings.set(modulesWithoutIgnored ?? []);
    modulesWithoutIgnored?.forEach((x) => {
      if (x.Name === 'encryption-module' && this.isNew()) {
        return this.generalForm.controls.encryption.setValue(x.Value ?? '');
      }
    });

    var retentionValue: RetentionType = 'all';
    ignoredModules?.forEach((x) => {
      if (x.Name === 'dblock-size') {
        this.optionsFields.remoteVolumeSize.set(x.Value ?? '50MB');
      }

      if (x.Name === 'keep-time') {
        // If this is not filled correctly, revert to 'all'
        const v = x.Value ?? '';
        if (v !== '') {
          retentionValue = 'time';
          return this.optionsFields.backupRetentionTime.set(x.Value ?? '');
        }
      }

      if (x.Name === 'keep-versions') {
        // If this is not filled correctly, revert to 'all'
        const v = x.Value ?? '';
        if (v !== '') {
          retentionValue = 'versions';
          return this.optionsFields.backupRetentionVersions.set(x.Value ? parseInt(x.Value) : null);
        }
      }

      if (x.Name === 'retention-policy') {
        // If this is not filled correctly, revert to 'all'
        const v = x.Value ?? '';
        if (v !== '') {
          if (x.Value === SMART_RETENTION) {
            retentionValue = 'smart';
          } else {
            retentionValue = 'custom';
            return this.optionsFields.backupRetentionCustom.set(x.Value ?? '');
          }
        }
      }
    });

    this.optionsFields.backupRetention.set(retentionValue);
  }

  getScheduleFormValue() {
    return {
      autoRun: this.scheduleFields.autoRun(),
      nextTime: this.scheduleFields.nextTime(),
      runAgain: this.scheduleFields.runAgain(),
    };
  }

  #mapFormsToBackup() {
    const generalFormValue = this.generalForm.value;
    const scheduleFormValue = this.getScheduleFormValue();
    const sourceDataFormValue = this.sourceDataForm.value;

    const targetUrl = this.targetUrlModel();

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
    const settings = this.mapFormsToSettings();

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
        TargetURL: targetUrl ?? null,
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
        ? {
            Repeat: scheduleRepeat,
            Time: scheduleFormValue.nextTime?.date
              ? new Date(
                  `${scheduleFormValue.nextTime.date}T${scheduleFormValue.nextTime?.time || '00:00:00'}`
                ).toISOString()
              : null,
            AllowedDays: allowedDays,
          }
        : null,
      // ExtraOptions: {
      //   BackupID: this.backupId(),
      //   Operation: this.backupId() ? 'Update' : 'Create',
      // },
    };
  }

  mapFormsToSettings(settingsIgnoreList: string[] = []) {
    const generalFormValue = this.generalForm.value;
    const modulesToIgnore = [
      '--no-encryption',
      '--exclude-files-attributes',
      '--skip-files-larger-than',
      'encryption-module',
      'passphrase',
      'keep-time',
      'keep-versions',
      'retention-policy',
      'dblock-size',
      'compression-module',
      '--compression-module',
    ];

    let encryption = [
      {
        Name: '--no-encryption',
        Value: 'True',
      },
    ];

    if (generalFormValue.encryption !== '') {
      encryption = [
        {
          Name: 'encryption-module',
          Value: generalFormValue.encryption! ?? null,
        },
        {
          Name: 'passphrase',
          Value: generalFormValue.password! ?? null,
        },
      ];
    }

    const optionFields = [
      {
        Name: 'dblock-size',
        Value: this.optionsFields.remoteVolumeSize(),
      },
    ];

    switch (this.optionsFields.backupRetention()) {
      case 'time':
        optionFields.push({
          Name: 'keep-time',
          Value: this.optionsFields.backupRetentionTime(),
        });
        break;

      case 'versions':
        optionFields.push({
          Name: 'keep-versions',
          Value: this.optionsFields.backupRetentionVersions()?.toString() ?? '',
        });
        break;

      case 'custom':
        optionFields.push({
          Name: 'retention-policy',
          Value: this.optionsFields.backupRetentionCustom(),
        });
        break;

      case 'smart':
        optionFields.push({
          Name: 'retention-policy',
          Value: SMART_RETENTION,
        });
        break;
    }

    const _settingsIgnoreList = [...settingsIgnoreList, ...modulesToIgnore];
    const settings = this.settings()
      .filter((x) => !_settingsIgnoreList.includes(x.Name!))
      .map((y) => {
        let Value = y.Value;

        if (typeof y.Value === 'number') {
          Value = (y.Value as number).toString();
        }

        if (typeof y.Value === 'boolean') {
          Value = (y.Value as Boolean) ? 'True' : 'False';
        }

        return {
          Name: y.Name?.startsWith('--') ? y.Name : `--${y.Name}`,
          Value,
        };
      });

    return [...encryption, ...optionFields, ...settings];
  }

  #evaluateTimeString(t: string | undefined) {
    if (!t || t?.indexOf('T') === -1) {
      return {
        time: t ?? '13:00',
      };
    }

    const date = new Date(t);

    return {
      time: `${('' + date.getHours()).padStart(2, '0')}:${('' + date.getMinutes()).padStart(2, '0')}`,
      date: date.toISOString().split('T')[0],
    };
  }

  setTargetUrl(targetUrl: string | null) {
    this.targetUrlModel.set(targetUrl);
  }

  #resetAllForms() {
    this.generalForm.reset();
    this.sourceDataForm.reset();
    this.scheduleFields.autoRun.set(SCHEDULE_FIELD_DEFAULTS.autoRun);
    this.scheduleFields.nextTime.set(SCHEDULE_FIELD_DEFAULTS.nextTime);
    this.scheduleFields.runAgain.set(SCHEDULE_FIELD_DEFAULTS.runAgain);
    this.optionsFields.remoteVolumeSize.set('50MB');
    this.optionsFields.backupRetention.set('all');
    this.settings.set([]);
    this.targetUrlModel.set(null);
  }
}
