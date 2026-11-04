import { TimeZoneDto } from '../core/openapi';

/**
 * The server setting holding the time zone id the server schedules in.
 * An empty value means the local time zone of the machine running the server.
 */
export const SERVER_TIMEZONE_KEY = 'server-timezone';

/**
 * The control value standing in for the empty server value: the select cannot
 * show an empty string as a selection, and with inline search an empty input
 * means "no filter".
 */
export const SERVER_TIMEZONE_DEFAULT = 'default';

export type ServerTimezoneOption = { value: string; label: string };

/**
 * Formats a .NET TimeSpan string such as "01:00:00" or "-05:30:00" as "UTC+01:00".
 */
function formatUtcOffset(offset: string | null | undefined): string | null {
  const match = /^(-)?(\d{1,2}):(\d{2})/.exec((offset ?? '').trim());
  if (!match) return null;

  const sign = match[1] ? '-' : '+';
  return `UTC${sign}${match[2].padStart(2, '0')}:${match[3]}`;
}

/**
 * Builds the label for a time zone. The display name reported by the server
 * usually carries the offset already, as in "(UTC+01:00) Copenhagen"; when it
 * does not, the current offset is prepended so the list stays scannable.
 */
export function toServerTimezoneLabel(timeZone: TimeZoneDto): string {
  const id = (timeZone.ID ?? '').trim();
  const displayName = (timeZone.DisplayName ?? '').trim() || id;
  const offset = formatUtcOffset(timeZone.CurrentUTCOffset);

  if (!offset || /(^|\()utc\b/i.test(displayName)) return displayName;

  return `(${offset}) ${displayName}`;
}

/**
 * Builds the select options: the system default first, then the server's time
 * zones in the order reported. A saved id the server does not list (a zone
 * from another operating system, or a legacy name) is appended so the saved
 * selection stays visible instead of silently showing the default.
 */
export function toServerTimezoneOptions(
  timeZones: TimeZoneDto[] | null | undefined,
  savedValue: string | null | undefined
): ServerTimezoneOption[] {
  const options: ServerTimezoneOption[] = [{ value: SERVER_TIMEZONE_DEFAULT, label: $localize`System default` }];

  for (const timeZone of timeZones ?? []) {
    const id = (timeZone.ID ?? '').trim();
    if (id === '' || id === SERVER_TIMEZONE_DEFAULT) continue;

    options.push({ value: id, label: toServerTimezoneLabel(timeZone) });
  }

  const saved = toServerTimezoneControlValue(savedValue);
  if (saved !== SERVER_TIMEZONE_DEFAULT && !options.some((option) => option.value === saved)) {
    options.push({ value: saved, label: saved });
  }

  return options;
}

/**
 * Maps the stored server value to the control value: empty is the system default.
 */
export const toServerTimezoneControlValue = (value: string | null | undefined): string => {
  const id = (value ?? '').trim();
  return id === '' ? SERVER_TIMEZONE_DEFAULT : id;
};

/**
 * Maps the control value to the stored server value: the system default is stored as empty.
 */
export const toServerTimezoneSetting = (value: string): string => (value === SERVER_TIMEZONE_DEFAULT ? '' : value);
