import {
  BackupAndScheduleInputDto,
  BackupDto,
  OperationType,
  ScheduleInputDto,
  SettingInputDto,
} from '../../core/openapi';
import { splitSize } from '../../core/functions/parse-size';
import { resolveBackupEncryptionSettings } from '../backup-encryption-settings';
import { BackupOptionsFormValue, SMART_RETENTION } from './backup-options';
import { GeneralFormValue, NONE_OPTION } from './general-form';
import { SourceDataFormValue } from './source-data-form';

export type BackupTargetUrl = {
  uiKey: string;
  url: string;
  connectionStringId: number | null;
  urlKey: string | null;
  save: boolean;
  mode?: string | null;
  interval?: string | null;
  options?: Record<string, unknown> | null;
};

export const secondaryDestinationMode = (target: BackupTargetUrl) => (target.mode ?? 'inline').trim().toLowerCase();

export const secondaryDestinationCount = (target: BackupTargetUrl) =>
  Object.entries(target.options ?? {}).find(([key]) => key.toLowerCase() === 'count')?.[1];

export function secondaryDestinationError(target: BackupTargetUrl): 'interval' | 'count' | null {
  const mode = secondaryDestinationMode(target);
  if (mode === 'counting') {
    const count = secondaryDestinationCount(target);
    return typeof count === 'number' && Number.isInteger(count) && count > 0 && count <= 2147483647 ? null : 'count';
  }
  if (mode !== 'interval') return null;

  // Match Timeparser.ParseTimeSpan: seconds or signed integer parts with case-sensitive units.
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, D: 86400, W: 604800, M: 2592000, Y: 31536000 };
  let remaining = target.interval?.trim() ?? '';
  let seconds = 0;
  if (/^[+-]?\d+$/.test(remaining)) {
    seconds = Number(remaining);
    remaining = '';
  } else {
    while (remaining) {
      const part = /^([+-]?\d+)\s*([smhDWMY])\s*/.exec(remaining);
      if (!part) return 'interval';
      const factor = Number(part[1]);
      if (!Number.isInteger(factor) || factor < -2147483648 || factor > 2147483647) return 'interval';
      seconds += factor * units[part[2]];
      if (Math.abs(seconds) > 922337203685.4775) return 'interval';
      remaining = remaining.slice(part[0].length);
    }
  }
  return seconds > 0 && seconds <= 922337203685.4775 ? null : 'interval';
}

export type BackupFormValue = {
  general: GeneralFormValue;
  sourceData: SourceDataFormValue;
  schedule: ScheduleInputDto | null;
  targetUrls: BackupTargetUrl[];
  settings: SettingInputDto[];
};

export function mapBackupToGeneralForm(backup: BackupDto) {
  const name = backup.Name ?? '';
  const description = backup.Description ?? '';
  const { encryptionDisabled, encryptionModule, passphrase } = resolveBackupEncryptionSettings(backup.Settings);
  const operationType = backup.OperationType ?? 'Backup';

  const baseUpdate: GeneralFormValue = {
    name: backup.Name ?? '',
    description: backup.Description ?? '',
    operationType,
  };

  if (name && name !== '') {
    baseUpdate.name = name;
  }

  if (description && description !== '') {
    baseUpdate.description = description;
  }

  if (encryptionDisabled) {
    baseUpdate.encryption = NONE_OPTION.Key;
  } else if (encryptionModule) {
    baseUpdate.encryption = encryptionModule;
  }

  baseUpdate.password = passphrase;
  baseUpdate.repeatPassword = passphrase;

  return baseUpdate;
}

export function mapBackupToSourceDataForm(backup: BackupDto) {
  const path = backup.Sources ?? '';
  const filters = backup.Filters?.map((x) => `${x.Include ? '+' : '-'}${x.Expression}`) ?? [];
  const filesLargerThan =
    backup.Settings?.find((x) => x.Name === '--skip-files-larger-than')?.Value?.toUpperCase() ?? null;

  const sourceObj = {
    path: [...path, ...filters].join('\0'),
    excludes: {
      filesLargerThan: filesLargerThan === null ? undefined : splitSize(filesLargerThan),
    },
  };

  return sourceObj;
}

export function mapBackupFormToSettings(
  generalFormValue: GeneralFormValue,
  optionsFields: BackupOptionsFormValue,
  formSettings: SettingInputDto[],
  syncMode: boolean,
  settingsIgnoreList: string[] = []
) {
  // These are stored different the in ngax client, so for compatibility we
  // store them without the -- prefix
  const legacyOptionValues = ['dblock-size', 'compression-module'];
  const modulesToIgnore = [
    '--no-encryption',
    '--skip-files-larger-than',
    'encryption-module',
    'passphrase',
    'keep-time',
    'keep-versions',
    'retention-policy',
    ...legacyOptionValues,
    ...legacyOptionValues.map((x) => `--${x}`),
  ];

  let encryption = [
    {
      Name: '--no-encryption',
      Value: 'True',
    },
  ];

  const isSyncMode = generalFormValue.operationType === 'Sync';

  if (!isSyncMode && generalFormValue.encryption !== '' && generalFormValue.encryption !== NONE_OPTION.Key) {
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

  let legacyOptions = legacyOptionValues
    .map((legacyOption) => {
      const matchingSetting = formSettings.find((x) => x.Name === legacyOption || x.Name === '--' + legacyOption);

      if (matchingSetting)
        return {
          Name: legacyOption,
          Value: matchingSetting.Value,
        };

      return null;
    })
    .filter((x) => x !== null);

  const optionFields = [];

  if (!syncMode) {
    switch (optionsFields.backupRetention) {
      case 'time':
        optionFields.push({
          Name: 'keep-time',
          Value: optionsFields.backupRetentionTime,
        });
        break;

      case 'versions':
        optionFields.push({
          Name: 'keep-versions',
          Value: optionsFields.backupRetentionVersions?.toString() ?? '',
        });
        break;

      case 'custom':
        optionFields.push({
          Name: 'retention-policy',
          Value: optionsFields.backupRetentionCustom,
        });
        break;

      case 'smart':
        optionFields.push({
          Name: 'retention-policy',
          Value: SMART_RETENTION,
        });
        break;
    }
  }

  const _settingsIgnoreList = [...settingsIgnoreList, ...modulesToIgnore];
  const settings = formSettings
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

  return [...encryption, ...legacyOptions, ...optionFields, ...settings];
}

export function mapBackupFormToDto(form: BackupFormValue): BackupAndScheduleInputDto {
  const generalFormValue = form.general;
  const scheduleFormValue = form.schedule;
  const sourceDataFormValue = form.sourceData;

  const targetUrls = form.targetUrls;
  const firstTarget = targetUrls[0];
  const targetUrl = firstTarget?.url ?? null;

  const pathFilters = sourceDataFormValue.path?.split('\0') ?? [];
  const settings = [...form.settings];

  const filesLargerThan = sourceDataFormValue.excludes?.filesLargerThan;

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
      ConnectionStringID: firstTarget?.connectionStringId ?? null,
      OperationType: (generalFormValue.operationType as OperationType) ?? 'Backup',
      Sources: pathFilters.filter((x) => !(x.startsWith('-') || x.startsWith('+'))),
      Settings: settings,
      Filters: pathFilters
        .filter((x) => x.startsWith('-') || x.startsWith('+'))
        .map((x, index) => ({
          Order: index,
          Include: x.startsWith('+'),
          Expression: x.slice(1),
        })),
    },
    Schedule: scheduleFormValue,
  };
}

export function mapBackupToOptionsForm(
  backup: BackupDto,
  globalSettings: Record<string, string> | undefined,
  includeGlobalOptions = false,
  isNew = false
) {
  const settingsToExclude = [
    '--no-encryption',
    '--skip-files-larger-than',
    'passphrase',
    'keep-time',
    'keep-versions',
    'retention-policy',
  ];

  const allSettings = (backup.Settings ?? []).map((x) => <SettingInputDto>x);

  if (includeGlobalOptions) {
    const serverSettings = globalSettings ?? {};
    Object.keys(serverSettings)
      .filter((x) => x.startsWith('--'))
      .forEach((key) => {
        const settingExists = allSettings.find((x) => x.Name === key);
        if (!settingExists) {
          allSettings.push({
            Name: key,
            Value: serverSettings[key],
            Filter: null,
          });
        }
      });
  }

  const settingsWithoutIgnored = allSettings.filter((x) => !settingsToExclude.includes(x.Name!));
  const excludedSettings = allSettings.filter((x) => settingsToExclude.includes(x.Name!));

  const fields: Partial<BackupOptionsFormValue> = {};
  const encryptionValues: string[] = [];
  settingsWithoutIgnored?.forEach((x) => {
    if (x.Name === 'encryption-module' && isNew) {
      encryptionValues.push(x.Value ?? '');
      return;
    }
  });

  var retentionValue: BackupOptionsFormValue['backupRetention'] = 'all';
  excludedSettings?.forEach((x) => {
    if (x.Name === 'keep-time') {
      // If this is not filled correctly, revert to 'all'
      const v = x.Value ?? '';
      if (v !== '') {
        retentionValue = 'time';
        fields.backupRetentionTime = x.Value ?? '';
        return;
      }
    }

    if (x.Name === 'keep-versions') {
      // If this is not filled correctly, revert to 'all'
      const v = x.Value ?? '';
      if (v !== '') {
        retentionValue = 'versions';
        fields.backupRetentionVersions = x.Value ? parseInt(x.Value) : null;
        return;
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
          fields.backupRetentionCustom = x.Value ?? '';
          return;
        }
      }
    }
  });

  return { settings: settingsWithoutIgnored, encryptionValues, fields: { ...fields, backupRetention: retentionValue } };
}
