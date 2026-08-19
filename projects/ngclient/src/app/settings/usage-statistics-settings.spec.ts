import { describe, expect, it } from 'vitest';
import {
  toUsageReporterLevel,
  toUsageStatisticsControlValue,
  USAGE_STATISTICS_OPTIONS,
  UsageStatisticsControlValue,
} from './usage-statistics-settings';

describe('usage statistics settings', () => {
  it.each<[string | null | undefined, UsageStatisticsControlValue]>([
    ['', 'default'],
    ['   ', 'default'],
    [null, 'default'],
    [undefined, 'default'],
    ['unknown', 'default'],
    ['information', 'information'],
    [' WARNING ', 'warning'],
    ['Error', 'error'],
    ['CRASH', 'crash'],
    ['none', 'none'],
    [' Disabled ', 'none'],
  ])('maps server value %s to control value %s', (serverValue, controlValue) => {
    expect(toUsageStatisticsControlValue(serverValue)).toBe(controlValue);
  });

  it.each<[UsageStatisticsControlValue, string]>([
    ['default', ''],
    ['information', 'information'],
    ['warning', 'warning'],
    ['error', 'error'],
    ['crash', 'crash'],
    ['none', 'none'],
  ])('maps control value %s to server value %s', (controlValue, serverValue) => {
    expect(toUsageReporterLevel(controlValue)).toBe(serverValue);
  });

  it('keeps system default and disabled as distinct options with their existing labels', () => {
    expect(USAGE_STATISTICS_OPTIONS.map(({ value }) => value)).toEqual([
      'default',
      'information',
      'warning',
      'error',
      'crash',
      'none',
    ]);
    expect(USAGE_STATISTICS_OPTIONS[0].label).toBe('System default ($value)');
    expect(USAGE_STATISTICS_OPTIONS.at(-1)?.label).toBe('None / disabled');
  });
});
