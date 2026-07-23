import { GetApiV1ServersettingsResponse, SettingDto } from '../../core/openapi';

type RestoreSetting = Pick<SettingDto, 'Name' | 'Value'>;

export const RESTORE_OPTION_DEFAULTS = {
  handleExisting: 'saveTimestamp' as const,
  permissions: false,
  includeMetadata: true,
};

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

const normalizeOptionName = (name: string | null | undefined) => (name ?? '').trim().replace(/^--/, '').toLowerCase();

const parseBooleanValue = (value: string | null | undefined) => TRUE_VALUES.has((value ?? '').trim().toLowerCase());

const resolveBooleanOption = (
  optionName: string,
  backupSettings: RestoreSetting[],
  serverSettings: GetApiV1ServersettingsResponse,
  fallback: boolean
) => {
  const normalizedName = normalizeOptionName(optionName);
  const backupSetting = backupSettings.find((setting) => normalizeOptionName(setting.Name) === normalizedName);
  if (backupSetting) return parseBooleanValue(backupSetting.Value);

  const serverSettingKey = Object.keys(serverSettings).find((key) => normalizeOptionName(key) === normalizedName);
  if (serverSettingKey) return parseBooleanValue(serverSettings[serverSettingKey]);

  return fallback;
};

export const resolveRestoreOptionDefaults = (
  backupSettings: RestoreSetting[] | null | undefined,
  serverSettings: GetApiV1ServersettingsResponse
) => {
  const settings = backupSettings ?? [];
  const permissions = resolveBooleanOption(
    'restore-permissions',
    settings,
    serverSettings,
    RESTORE_OPTION_DEFAULTS.permissions
  );
  const skipMetadata = resolveBooleanOption('skip-metadata', settings, serverSettings, false);

  return {
    permissions,
    includeMetadata: !skipMetadata,
  };
};
