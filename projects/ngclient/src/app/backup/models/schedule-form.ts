import { signal } from '@angular/core';
import { DayOfWeek, ScheduleInputDto } from '../../core/openapi';

export const SCHEDULE_DEFAULT_OPTIONS = [
  {
    key: $localize`Daily 13:00`,
    value: 'daily',
    data: {
      autoRun: true,
      nextTime: {
        time: '13:00:00',
        date: toLocalDateString(new Date()),
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
    },
  },
  {
    key: $localize`Weekdays 13:00`,
    value: 'weekdays',
    data: {
      autoRun: true,
      nextTime: {
        time: '13:00:00',
        date: toLocalDateString(new Date()),
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
          sat: false,
          sun: false,
        },
      },
    },
  },
  {
    key: $localize`Weekly monday 13:00`,
    value: 'weekly',
    data: {
      autoRun: true,
      nextTime: {
        time: '13:00:00',
        get date() {
          return getNextRunDate(this.time, new Date(), 1);
        },
      },
      runAgain: {
        repeatValue: 1,
        repeatUnit: 'W',
        allowedDays: {
          mon: true,
          tue: false,
          wed: false,
          thu: false,
          fri: false,
          sat: false,
          sun: false,
        },
      },
    },
  },
  {
    key: $localize`Don't run automatically`,
    value: 'disabled',
    data: {
      autoRun: false,
      nextTime: {
        time: '13:00:00',
        date: toLocalDateString(new Date()),
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
    },
  },
  {
    key: $localize`Custom`,
    value: 'custom',
    data: {
      autoRun: true,
      nextTime: {
        time: '13:00:00',
        date: toLocalDateString(new Date()),
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
    },
  },
];

type ScheduleOption = (typeof SCHEDULE_DEFAULT_OPTIONS)[number];

export type ScheduleFormValue = Omit<ScheduleOption['data'], 'nextTime'> & {
  nextTime: {
    time: string;
    date: string | Date;
  };
};

// Formats the local calendar day as YYYY-MM-DD; toISOString() would give the UTC day instead.
export function toLocalDateString(date: Date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Returns the next future local date for a time, optionally restricted to a weekday (0 = Sunday).
// A past start time would make the server run the backup as soon as it is saved.
export function getNextRunDate(time: string, now = new Date(), dayOfWeek?: number) {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(':').map((x) => parseInt(x) || 0);
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds);

  if (dayOfWeek !== undefined) {
    next.setDate(next.getDate() + ((dayOfWeek - next.getDay() + 7) % 7));
  }

  if (next <= now) {
    next.setDate(next.getDate() + (dayOfWeek === undefined ? 1 : 7));
  }

  return toLocalDateString(next);
}

export function getLocalDateParts(value: string | Date) {
  if (typeof value === 'string') {
    const canonicalDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (canonicalDate) {
      return {
        year: parseInt(canonicalDate[1]),
        month: parseInt(canonicalDate[2]) - 1,
        day: parseInt(canonicalDate[3]),
      };
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
}

export function scheduleOptionToSchedule(schedule: ScheduleFormValue): ScheduleInputDto | null {
  if (!schedule.autoRun) {
    return null;
  }

  const allowedDays = [
    schedule.runAgain.allowedDays.mon ? 'Monday' : null,
    schedule.runAgain.allowedDays.tue ? 'Tuesday' : null,
    schedule.runAgain.allowedDays.wed ? 'Wednesday' : null,
    schedule.runAgain.allowedDays.thu ? 'Thursday' : null,
    schedule.runAgain.allowedDays.fri ? 'Friday' : null,
    schedule.runAgain.allowedDays.sat ? 'Saturday' : null,
    schedule.runAgain.allowedDays.sun ? 'Sunday' : null,
  ].filter((x) => x !== null) as DayOfWeek[];

  // Loaded schedules use YYYY-MM-DD strings, which the Date constructor treats as UTC.
  // DatePicker selections are Date objects and already represent the selected local day.
  const { year, month, day } = getLocalDateParts(schedule.nextTime.date);
  const timeParts = schedule.nextTime.time.split(':');

  const hours = parseInt(timeParts[0] ?? '0');
  const minutes = parseInt(timeParts[1] ?? '0');
  const seconds = parseInt(timeParts[2] ?? '0');

  // Reconstruct the date object, keeping local date and time
  const date = new Date(year, month, day, hours, minutes, seconds, 0);

  const repeatValue = schedule.runAgain.repeatValue;
  const repeatUnit = schedule.runAgain.repeatUnit;

  return {
    Time: date.toISOString(),
    Repeat: `${repeatValue}${repeatUnit}`,
    AllowedDays: allowedDays,
  };
}

export const SCHEDULE_FIELD_DEFAULTS = () => {
  return {
    autoRun: signal(true),
    nextTime: {
      time: signal<string>('13:00'),
      date: signal<string | Date>(toLocalDateString(new Date())),
    },
    runAgain: {
      repeatValue: signal(1),
      repeatUnit: signal<string>('D'),
      allowedDays: {
        mon: signal(true),
        tue: signal(true),
        wed: signal(true),
        thu: signal(true),
        fri: signal(true),
        sat: signal(true),
        sun: signal(true),
      },
    },
  };
};

export function evaluateTimeString(t: string | undefined) {
  if (!t || t?.indexOf('T') === -1) {
    return {
      time: t ?? '13:00',
    };
  }

  const date = new Date(t);

  return {
    time: `${('' + date.getHours()).padStart(2, '0')}:${('' + date.getMinutes()).padStart(2, '0')}`,
    date: `${('' + date.getFullYear()).padStart(4, '0')}-${('' + (date.getMonth() + 1)).padStart(2, '0')}-${('' + date.getDate()).padStart(2, '0')}`,
  };
}
