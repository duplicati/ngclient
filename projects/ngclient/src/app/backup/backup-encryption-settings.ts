import { SettingDto } from '../core/openapi';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

const normalizeSettingName = (name: string | null | undefined) => (name ?? '').replace(/^--/, '').toLowerCase();

export const resolveBackupEncryptionSettings = (settings: SettingDto[] | null | undefined) => {
  const normalizedSettings = (settings ?? []).map((setting) => ({
    name: normalizeSettingName(setting.Name),
    value: setting.Value ?? '',
  }));
  const getValue = (name: string) => normalizedSettings.find((setting) => setting.name === name)?.value ?? '';

  return {
    encryptionDisabled: TRUE_VALUES.has(getValue('no-encryption').trim().toLowerCase()),
    encryptionModule: getValue('encryption-module'),
    passphrase: getValue('passphrase'),
  };
};
