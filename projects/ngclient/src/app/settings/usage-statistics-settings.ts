export type UsageStatisticsControlValue = 'default' | 'information' | 'warning' | 'error' | 'crash' | 'none';

export const USAGE_STATISTICS_OPTIONS: { value: UsageStatisticsControlValue; label: string }[] = [
  {
    value: 'default',
    label: $localize`System default ($value)`,
  },
  {
    value: 'information',
    label: $localize`Usage statistics, warnings, errors, and crashes`,
  },
  {
    value: 'warning',
    label: $localize`Warnings, errors and crashes`,
  },
  {
    value: 'error',
    label: $localize`Errors and crashes`,
  },
  {
    value: 'crash',
    label: $localize`Crashes only`,
  },
  {
    value: 'none',
    label: $localize`None / disabled`,
  },
];

const REPORTING_LEVELS = new Set<UsageStatisticsControlValue>(['information', 'warning', 'error', 'crash', 'none']);

export const toUsageStatisticsControlValue = (value: string | null | undefined): UsageStatisticsControlValue => {
  const normalizedValue = (value ?? '').trim().toLowerCase();

  if (normalizedValue === 'disabled') return 'none';
  if (REPORTING_LEVELS.has(normalizedValue as UsageStatisticsControlValue)) {
    return normalizedValue as UsageStatisticsControlValue;
  }

  return 'default';
};

export const toUsageReporterLevel = (value: UsageStatisticsControlValue) => (value === 'default' ? '' : value);
