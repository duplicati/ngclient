import { IDLE_LOGOUT_MINUTE_OPTIONS } from '../core/states/idle-logout.state';

export type IdleLogoutOption = { value: string; label: string };

export function toIdleLogoutLabel(minutes: number): string {
  if (minutes <= 0) return $localize`Never sign out automatically`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1
      ? $localize`After 1 hour without activity`
      : $localize`After ${hours}:hours: hours without activity`;
  }
  return $localize`After ${minutes}:minutes: minutes without activity`;
}

/** The offered choices, plus the stored value when it is not one of them */
export function toIdleLogoutOptions(current: number): IdleLogoutOption[] {
  const minutes: number[] = [...IDLE_LOGOUT_MINUTE_OPTIONS];
  if (current > 0 && !minutes.includes(current)) minutes.push(current);

  return minutes.sort((a, b) => a - b).map((value) => ({ value: String(value), label: toIdleLogoutLabel(value) }));
}

/** Reads the selected minutes, or null when the selection is not a known choice */
export function toIdleLogoutMinutes(selected: unknown[], options: IdleLogoutOption[]): number | null {
  const value = (selected[0] as { value?: string } | undefined)?.value;
  if (value === undefined || !options.some((option) => option.value === value)) return null;

  return Number(value);
}
