import type dayjs from 'dayjs/esm';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Days = (typeof DAY_KEYS)[number];
type AllowedDays = Record<Days, boolean>;

// Day.js day-of-week index for each key (Sunday = 0)
const DAY_INDEX: Record<Days, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
};

export function formatAllowedDays(dayjsInstance: typeof dayjs, allowedDays: AllowedDays) {
  const days = DAY_KEYS.filter((key) => allowedDays[key]).map((key) =>
    dayjsInstance().day(DAY_INDEX[key]).format('dddd')
  );

  if (days.length === 7) return $localize`All days`;
  if (days.length === 0) return $localize`No days selected`;

  return new Intl.ListFormat(dayjsInstance.locale(), { style: 'long', type: 'conjunction' }).format(days);
}
