type Days = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type AllowedDays = Record<Days, boolean>;

export function formatRepeatInterval(value: number, unit: string) {
  switch (unit) {
    case 's':
      return value === 1 ? $localize`Every 1 second` : $localize`Every ${value} seconds`;
    case 'm':
      return value === 1 ? $localize`Every 1 minute` : $localize`Every ${value} minutes`;
    case 'h':
      return value === 1 ? $localize`Every 1 hour` : $localize`Every ${value} hours`;
    case 'W':
      return value === 1 ? $localize`Every 1 week` : $localize`Every ${value} weeks`;
    case 'M':
      return value === 1 ? $localize`Every 1 month` : $localize`Every ${value} months`;
    case 'Y':
      return value === 1 ? $localize`Every 1 year` : $localize`Every ${value} years`;
    case 'D':
    default:
      return value === 1 ? $localize`Every 1 day` : $localize`Every ${value} days`;
  }
}

export function formatAllowedDays(allowedDays: AllowedDays) {
  const days = [
    allowedDays.mon ? $localize`Monday` : null,
    allowedDays.tue ? $localize`Tuesday` : null,
    allowedDays.wed ? $localize`Wednesday` : null,
    allowedDays.thu ? $localize`Thursday` : null,
    allowedDays.fri ? $localize`Friday` : null,
    allowedDays.sat ? $localize`Saturday` : null,
    allowedDays.sun ? $localize`Sunday` : null,
  ].filter((day) => day !== null);

  if (days.length === 7) return $localize`Every day`;
  if (days.length === 0) return $localize`No days selected`;

  return days.join(', ');
}
