const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + months + 1, 0);
  result.setDate(Math.min(date.getDate(), result.getDate()));
  return result;
}

function monthDistance(first: Date, second: Date): number {
  // Anchor to the date with the higher day of the month so that month ends
  // (for example January 31 to February 28) count as a full month.
  const [anchor, target] = first.getDate() < second.getDate() ? [second, first] : [first, second];
  const months = (target.getFullYear() - anchor.getFullYear()) * 12 + target.getMonth() - anchor.getMonth();
  const current = addMonths(anchor, months);
  const remainder = target.getTime() - current.getTime();
  const adjacent = addMonths(anchor, months + (remainder < 0 ? -1 : 1));
  return Math.abs(months + remainder / Math.abs(adjacent.getTime() - current.getTime()));
}

/** Keep the previous humanization thresholds while letting Intl choose the wording. */
export function relativeTimeMagnitude(value: Date, reference: Date): [number, Intl.RelativeTimeFormatUnit] {
  const elapsed = Math.abs(value.getTime() - reference.getTime());
  const seconds = Math.round(elapsed / SECOND);
  if (seconds <= 44) return [seconds, 'second'];
  if (seconds <= 89) return [1, 'minute'];
  const minutes = Math.round(elapsed / MINUTE);
  if (minutes <= 44) return [minutes, 'minute'];
  if (minutes <= 89) return [1, 'hour'];
  const hours = Math.round(elapsed / HOUR);
  if (hours <= 21) return [hours, 'hour'];
  if (hours <= 35) return [1, 'day'];
  const zoneDelta = (value.getTimezoneOffset() - reference.getTimezoneOffset()) * MINUTE;
  const days = Math.round(Math.abs(value.getTime() - reference.getTime() - zoneDelta) / DAY);
  if (days <= 25) return [Math.max(1, days), 'day'];
  if (days <= 45) return [1, 'month'];
  const months = monthDistance(value, reference);
  if (Math.round(months) <= 10) return [Math.max(1, Math.round(months)), 'month'];
  if (Math.round(months) <= 17) return [1, 'year'];
  return [Math.round(months / 12), 'year'];
}
