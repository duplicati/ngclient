import { describe, expect, it } from 'vitest';
import { SettingDto } from '../core/openapi';
import { resolveBackupEncryptionSettings } from './backup-encryption-settings';

const settings = (values: Array<[string, string]>) => values.map(([Name, Value]) => ({ Name, Value }) as SettingDto);

describe('resolveBackupEncryptionSettings', () => {
  it('resolves encryption settings without option prefixes', () => {
    expect(
      resolveBackupEncryptionSettings(
        settings([
          ['encryption-module', 'aes'],
          ['passphrase', 'secret'],
        ])
      )
    ).toEqual({
      encryptionDisabled: false,
      encryptionModule: 'aes',
      passphrase: 'secret',
    });
  });

  it('normalizes option prefixes and casing', () => {
    expect(
      resolveBackupEncryptionSettings(
        settings([
          ['--Encryption-Module', 'aes'],
          ['--PASSPHRASE', 'secret'],
        ])
      )
    ).toEqual({
      encryptionDisabled: false,
      encryptionModule: 'aes',
      passphrase: 'secret',
    });
  });

  it.each(['true', 'TRUE', '1', 'yes', 'on'])('recognizes %s as disabling encryption', (value) => {
    expect(resolveBackupEncryptionSettings(settings([['--no-encryption', value]])).encryptionDisabled).toBe(true);
  });

  it('does not disable encryption for an explicit false value', () => {
    expect(
      resolveBackupEncryptionSettings(
        settings([
          ['--no-encryption', 'false'],
          ['encryption-module', 'aes'],
        ])
      )
    ).toMatchObject({
      encryptionDisabled: false,
      encryptionModule: 'aes',
    });
  });
});
