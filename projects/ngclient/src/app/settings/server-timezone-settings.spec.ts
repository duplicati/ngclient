import { describe, expect, it } from 'vitest';
import { TimeZoneDto } from '../core/openapi';
import {
  SERVER_TIMEZONE_DEFAULT,
  toServerTimezoneControlValue,
  toServerTimezoneLabel,
  toServerTimezoneOptions,
  toServerTimezoneSetting,
} from './server-timezone-settings';

const zone = (ID: string, DisplayName: string | null, CurrentUTCOffset: string | null): TimeZoneDto => ({
  ID,
  DisplayName,
  CurrentUTCOffset,
});

describe('server timezone settings', () => {
  it.each<[string | null | undefined, string]>([
    ['', SERVER_TIMEZONE_DEFAULT],
    ['   ', SERVER_TIMEZONE_DEFAULT],
    [null, SERVER_TIMEZONE_DEFAULT],
    [undefined, SERVER_TIMEZONE_DEFAULT],
    ['Europe/Copenhagen', 'Europe/Copenhagen'],
    [' UTC ', 'UTC'],
  ])('maps server value %j to control value %s', (serverValue, controlValue) => {
    expect(toServerTimezoneControlValue(serverValue)).toBe(controlValue);
  });

  it.each<[string, string]>([
    [SERVER_TIMEZONE_DEFAULT, ''],
    ['Europe/Copenhagen', 'Europe/Copenhagen'],
    ['UTC', 'UTC'],
  ])('maps control value %s to server value %j', (controlValue, serverValue) => {
    expect(toServerTimezoneSetting(controlValue)).toBe(serverValue);
  });

  it.each<[TimeZoneDto, string]>([
    // Windows and ICU display names already carry the offset
    [
      zone('Europe/Copenhagen', '(UTC+01:00) Brussels, Copenhagen, Madrid, Paris', '01:00:00'),
      '(UTC+01:00) Brussels, Copenhagen, Madrid, Paris',
    ],
    [zone('UTC', '(UTC) Coordinated Universal Time', '00:00:00'), '(UTC) Coordinated Universal Time'],
    // A bare display name gets the current offset, including negative and half-hour offsets
    [zone('America/New_York', 'Eastern Standard Time', '-05:00:00'), '(UTC-05:00) Eastern Standard Time'],
    [zone('Asia/Kolkata', 'India Standard Time', '05:30:00'), '(UTC+05:30) India Standard Time'],
    [zone('Pacific/Chatham', 'Chatham Islands Time', '13:45:00'), '(UTC+13:45) Chatham Islands Time'],
    // Missing pieces fall back to the id
    [zone('Etc/GMT', null, null), 'Etc/GMT'],
    [zone('Etc/GMT', '', 'garbage'), 'Etc/GMT'],
    [zone('Etc/GMT', null, '00:00:00'), '(UTC+00:00) Etc/GMT'],
  ])('labels %j as %s', (timeZone, label) => {
    expect(toServerTimezoneLabel(timeZone)).toBe(label);
  });

  it('lists the system default first and keeps the server order', () => {
    const options = toServerTimezoneOptions(
      [
        zone('UTC', '(UTC) Coordinated Universal Time', '00:00:00'),
        zone('Europe/Copenhagen', '(UTC+01:00) Copenhagen', '01:00:00'),
      ],
      ''
    );
    expect(options).toEqual([
      { value: SERVER_TIMEZONE_DEFAULT, label: 'System default' },
      { value: 'UTC', label: '(UTC) Coordinated Universal Time' },
      { value: 'Europe/Copenhagen', label: '(UTC+01:00) Copenhagen' },
    ]);
  });

  it('offers only the system default when the server reports no time zones', () => {
    expect(toServerTimezoneOptions(null, null)).toEqual([{ value: SERVER_TIMEZONE_DEFAULT, label: 'System default' }]);
    expect(toServerTimezoneOptions([], undefined)).toHaveLength(1);
  });

  it('skips entries without an id and ids clashing with the default sentinel', () => {
    const options = toServerTimezoneOptions(
      [
        zone('', 'Nameless', '00:00:00'),
        zone('  ', 'Blank', '00:00:00'),
        zone(SERVER_TIMEZONE_DEFAULT, 'Clash', '00:00:00'),
        zone('UTC', 'UTC', '00:00:00'),
      ],
      ''
    );
    expect(options.map(({ value }) => value)).toEqual([SERVER_TIMEZONE_DEFAULT, 'UTC']);
  });

  it('appends a saved id the server does not list, so the selection stays visible', () => {
    const options = toServerTimezoneOptions([zone('UTC', 'UTC', '00:00:00')], 'US/Eastern');
    expect(options.map(({ value }) => value)).toEqual([SERVER_TIMEZONE_DEFAULT, 'UTC', 'US/Eastern']);
    expect(options[2].label).toBe('US/Eastern');
  });

  it('does not duplicate a saved id the server lists', () => {
    const options = toServerTimezoneOptions([zone('UTC', 'UTC', '00:00:00')], ' UTC ');
    expect(options.map(({ value }) => value)).toEqual([SERVER_TIMEZONE_DEFAULT, 'UTC']);
  });
});
