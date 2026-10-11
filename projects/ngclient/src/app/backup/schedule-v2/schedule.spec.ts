import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleOptionToSchedule } from './schedule.component';

describe('scheduleOptionToSchedule', () => {
  const createSchedule = (date: string | Date, time = '08:50:30') => ({
    autoRun: true,
    nextTime: { date, time },
    runAgain: {
      repeatValue: 2,
      repeatUnit: 'W',
      allowedDays: {
        mon: true,
        tue: false,
        wed: false,
        thu: false,
        fri: true,
        sat: false,
        sun: false,
      },
    },
  });

  afterEach(() => vi.unstubAllEnvs());

  it('preserves a canonical local date west of UTC', () => {
    vi.stubEnv('TZ', 'America/New_York');

    expect(scheduleOptionToSchedule(createSchedule('2026-06-14'))).toEqual({
      Time: '2026-06-14T12:50:30.000Z',
      Repeat: '2W',
      AllowedDays: ['Monday', 'Friday'],
    });
  });

  it('preserves a canonical local date east of UTC', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');

    expect(scheduleOptionToSchedule(createSchedule('2026-06-14'))?.Time).toBe('2026-06-13T23:50:30.000Z');
  });

  it('uses the local calendar date selected by the DatePicker', () => {
    vi.stubEnv('TZ', 'America/New_York');
    const selectedDate = new Date(2026, 5, 14);

    expect(scheduleOptionToSchedule(createSchedule(selectedDate))?.Time).toBe('2026-06-14T12:50:30.000Z');
  });

  it('keeps accepting other parseable date strings', () => {
    vi.stubEnv('TZ', 'America/New_York');

    expect(scheduleOptionToSchedule(createSchedule('2026-06-14T00:00:00-04:00'))?.Time).toBe(
      '2026-06-14T12:50:30.000Z'
    );
  });

  it('returns null if autoRun is false', () => {
    const input = {
      autoRun: false,
      nextTime: {
        time: '13:00:00',
        date: '2026-06-14',
      },
      runAgain: {
        repeatValue: 1,
        repeatUnit: 'D',
        allowedDays: {
          mon: true,
          tue: true,
          wed: true,
          thu: true,
          fri: true,
          sat: true,
          sun: true,
        },
      },
    };

    expect(scheduleOptionToSchedule(input)).toBeNull();
  });
});

describe('default schedule date', () => {
  // 2026-10-11 08:00 in Tokyo, which is still 2026-10-10 in UTC.
  const tokyoMorning = new Date('2026-10-10T23:00:00.000Z');

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the local date for the field defaults', async () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.useFakeTimers({ now: tokyoMorning });
    const { SCHEDULE_FIELD_DEFAULTS } = await import('./schedule.component');

    expect(SCHEDULE_FIELD_DEFAULTS().nextTime.date()).toBe('2026-10-11');
  });

  it('uses the local date for the predefined options', async () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.useFakeTimers({ now: tokyoMorning });
    vi.resetModules();
    const { SCHEDULE_DEFAULT_OPTIONS } = await import('./schedule.component');

    expect(SCHEDULE_DEFAULT_OPTIONS.find((x) => x.value === 'daily')?.data.nextTime.date).toBe('2026-10-11');
  });

  it('uses the local date for the next Monday', async () => {
    // 12:00 on Monday 2026-10-12 in Kiritimati (UTC+14) is still Sunday in UTC.
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    vi.useFakeTimers({ now: tokyoMorning });
    vi.resetModules();
    const { SCHEDULE_DEFAULT_OPTIONS } = await import('./schedule.component');

    expect(SCHEDULE_DEFAULT_OPTIONS.find((x) => x.value === 'weekly')?.data.nextTime.date).toBe('2026-10-12');
  });
});
