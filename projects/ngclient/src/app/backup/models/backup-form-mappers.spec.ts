import { describe, expect, it } from 'vitest';
import { BackupDto, SettingInputDto } from '../../core/openapi';
import { mapBackupFormToDto, mapBackupFormToSettings, mapBackupToOptionsForm } from './backup-form-mappers';
import { createGeneralForm } from './general-form';
import { createSourceDataForm } from './source-data-form';
import { SCHEDULE_FIELD_DEFAULTS } from './schedule-form';

describe('backup form model boundaries', () => {
  it('creates independent form controls and schedule fields for each editor', () => {
    const firstGeneral = createGeneralForm();
    const secondGeneral = createGeneralForm();
    firstGeneral.controls.name.setValue('First');
    expect(secondGeneral.controls.name.value).toBe('');
    const firstSource = createSourceDataForm();
    const secondSource = createSourceDataForm();
    firstSource.controls.path.setValue('/first');
    expect(secondSource.controls.path.value).toBe('');
    const firstSchedule = SCHEDULE_FIELD_DEFAULTS();
    const secondSchedule = SCHEDULE_FIELD_DEFAULTS();
    firstSchedule.runAgain.allowedDays.mon.set(false);
    expect(secondSchedule.runAgain.allowedDays.mon()).toBe(true);
  });

  it('does not mutate supplied settings while adding the managed source size option', () => {
    const settings = Object.freeze([{ Name: '--retry-count', Value: '7' }]);
    const form = {
      general: { name: 'Backup', operationType: 'Backup' as const },
      sourceData: { path: '/source\0-*.tmp', excludes: { filesLargerThan: { size: 12, unit: 'MB' } } },
      schedule: null,
      targetUrls: [],
      settings: [...settings],
    };
    Object.freeze(form.settings);
    const first = mapBackupFormToDto(form);
    const second = mapBackupFormToDto(form);
    expect(first).toEqual(second);
    expect(first.Backup.Settings).toEqual([
      { Name: '--retry-count', Value: '7' },
      { Name: '--skip-files-larger-than', Value: '12MB' },
    ]);
    expect(form.settings).toEqual(settings);
  });

  it('preserves setting serialization and the caller ignore list without modifying input values', () => {
    const settings = [
      { Name: 'enabled', Value: true },
      { Name: '--retries', Value: 7 },
      { Name: 'omit-me', Value: 'secret' },
      { Name: '--custom-option', Value: 'a=b' },
    ] as unknown as SettingInputDto[];
    const original = structuredClone(settings);
    const saved = mapBackupFormToSettings(
      { encryption: '-', operationType: 'Backup' },
      {
        backupRetention: 'all',
        backupRetentionTime: '',
        backupRetentionVersions: 0,
        backupRetentionCustom: '',
      },
      settings,
      false,
      ['omit-me']
    );
    expect(saved).toEqual([
      { Name: '--no-encryption', Value: 'True' },
      { Name: '--enabled', Value: 'True' },
      { Name: '--retries', Value: '7' },
      { Name: '--custom-option', Value: 'a=b' },
    ]);
    expect(settings).toEqual(original);
  });

  it('merges defaults without mutating server data and preserves retention order and encryption updates', () => {
    const backup = {
      Settings: [
        { Name: 'keep-time', Value: '14D' },
        { Name: 'keep-versions', Value: '3' },
        { Name: 'encryption-module', Value: 'aes' },
        { Name: 'encryption-module', Value: 'gpg' },
        { Name: '--retry-count', Value: '7' },
      ],
    } as BackupDto;
    const before = structuredClone(backup);
    const global = { '--retry-count': '99', '--global-option': 'enabled' };
    const result = mapBackupToOptionsForm(backup, global, true, true);
    expect(result.fields).toEqual({
      backupRetention: 'versions',
      backupRetentionTime: '14D',
      backupRetentionVersions: 3,
    });
    expect(result.encryptionValues).toEqual(['aes', 'gpg']);
    expect(result.settings).toEqual([
      { Name: 'encryption-module', Value: 'aes' },
      { Name: 'encryption-module', Value: 'gpg' },
      { Name: '--retry-count', Value: '7' },
      { Name: '--global-option', Value: 'enabled', Filter: null },
    ]);
    expect(backup).toEqual(before);
    expect(global).toEqual({ '--retry-count': '99', '--global-option': 'enabled' });
  });
});
