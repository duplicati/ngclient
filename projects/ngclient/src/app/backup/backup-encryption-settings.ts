import { SettingDto } from '../core/openapi';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

// The encryption module the server uses when a backup has a passphrase and no encryption-module setting
const DEFAULT_ENCRYPTION_MODULE = 'aes';

const normalizeSettingName = (name: string | null | undefined) => (name ?? '').replace(/^--/, '').toLowerCase();

export const resolveBackupEncryptionSettings = (settings: SettingDto[] | null | undefined) => {
  const normalizedSettings = (settings ?? []).map((setting) => ({
    name: normalizeSettingName(setting.Name),
    value: setting.Value ?? '',
  }));
  const getValue = (name: string) => normalizedSettings.find((setting) => setting.name === name)?.value ?? '';

  const encryptionDisabled = TRUE_VALUES.has(getValue('no-encryption').trim().toLowerCase());
  const passphrase = getValue('passphrase');

  // A backup created through the API or by an older client can have only the passphrase. The server then
  // encrypts with the default module, so it must not be read as a backup without encryption
  const encryptionModule =
    getValue('encryption-module') || (!encryptionDisabled && passphrase !== '' ? DEFAULT_ENCRYPTION_MODULE : '');

  return {
    encryptionDisabled,
    encryptionModule,
    passphrase,
  };
};
