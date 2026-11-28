import { getIntlDisplayLocale } from '../../core/locales/intl-display-locale';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Days = (typeof DAY_KEYS)[number];
type AllowedDays = Record<Days, boolean>;

export function formatAllowedDays(locale: string, allowedDays: AllowedDays) {
  const selected = DAY_KEYS.filter((key) => allowedDays[key]);
  if (selected.length === 7) return $localize`All days`;
  if (selected.length === 0) return $localize`No days selected`;

  locale = getIntlDisplayLocale(locale);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const days = selected.map((key) => weekday.format(Date.UTC(2024, 0, 1 + DAY_KEYS.indexOf(key))));
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(days);
}
