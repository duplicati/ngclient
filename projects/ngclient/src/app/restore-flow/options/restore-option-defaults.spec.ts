import { describe, expect, it } from 'vitest';
import { RESTORE_OPTION_DEFAULTS, resolveRestoreOptionDefaults } from './restore-option-defaults';

describe('resolveRestoreOptionDefaults', () => {
  it('prefers an enabled backup setting over a disabled server default', () => {
    const result = resolveRestoreOptionDefaults([{ Name: '--restore-permissions', Value: 'True' }], {
      '--restore-permissions': 'False',
    });

    expect(result.permissions).toBe(true);
  });

  it('prefers a disabled backup setting over an enabled server default', () => {
    const result = resolveRestoreOptionDefaults([{ Name: 'RESTORE-PERMISSIONS', Value: 'False' }], {
      '--restore-permissions': 'True',
    });

    expect(result.permissions).toBe(false);
  });

  it('uses server defaults when the backup has no matching setting', () => {
    const result = resolveRestoreOptionDefaults([], {
      '--restore-permissions': ' yes ',
      '--skip-metadata': 'ON',
    });

    expect(result).toEqual({
      permissions: true,
      includeMetadata: false,
    });
  });

  it('uses the existing form defaults when neither setting is configured', () => {
    const result = resolveRestoreOptionDefaults(null, {});

    expect(result).toEqual({
      permissions: RESTORE_OPTION_DEFAULTS.permissions,
      includeMetadata: RESTORE_OPTION_DEFAULTS.includeMetadata,
    });
    expect(RESTORE_OPTION_DEFAULTS.handleExisting).toBe('saveTimestamp');
  });

  it.each(['true', '1', 'yes', 'on'])('accepts %s as a true boolean value', (value) => {
    expect(resolveRestoreOptionDefaults([{ Name: 'skip-metadata', Value: value }], {}).includeMetadata).toBe(false);
  });

  it('treats any other explicit value as false instead of using the lower-priority value', () => {
    const result = resolveRestoreOptionDefaults([{ Name: '--restore-permissions', Value: 'invalid' }], {
      '--restore-permissions': 'true',
    });

    expect(result.permissions).toBe(false);
  });
});
