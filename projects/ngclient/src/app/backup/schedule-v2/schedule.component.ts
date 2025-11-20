import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ShipButton,
  ShipDatepickerInput,
  ShipFormField,
  ShipIcon,
  ShipSelect,
  ShipToggle,
  ShipToggleCard,
} from '@ship-ui/core';
import { DayOfWeek, ScheduleInputDto } from '../../core/openapi';
import { BackupState } from '../backup.state';

const UNIT_OPTIONS = [
  {
    key: 's',
    label: $localize`Seconds`,
  },
  {
    key: 'm',
    label: $localize`Minutes`,
  },
  {
    key: 'h',
    label: $localize`Hours`,
  },
  {
    key: 'D',
    label: $localize`Days`,
  },
  {
    key: 'W',
    label: $localize`Weeks`,
  },
  {
    key: 'M',
    label: $localize`Months`,
  },
  {
    key: 'Y',
    label: $localize`Years`,
  },
];

export const SCHEDULE_DEFAULT_OPTIONS = [
  {
    key: $localize`Daily 13:00`,
    value: 'daily',
    data: {
      autoRun: true,
      nextTime: {
        time: '13:00:00',
        date: new Date().toISOString().split('T')[0],
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
        date: new Date().toISOString().split('T')[0],
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
        date: getNextMondayAt12PM().toISOString().split('T')[0],
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
        date: new Date().toISOString().split('T')[0],
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
        date: new Date().toISOString().split('T')[0],
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

export function scheduleOptionToSchedule(schedule: ScheduleOption['data']): ScheduleInputDto | null {
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

  const time = schedule.nextTime.time.split(':');
  const date = new Date(schedule.nextTime.date);

  date.setHours(parseInt(time[0]));
  date.setMinutes(parseInt(time[1]));

  const repeatValue = schedule.runAgain.repeatValue;
  const repeatUnit = schedule.runAgain.repeatUnit;

  return {
    Time: date.toISOString(),
    Repeat: `${repeatValue}${repeatUnit}`,
    AllowedDays: allowedDays,
  };
}

function getNextMondayAt12PM() {
  const d = new Date();
  const today = d.getDay();
  const daysUntilMonday = today === 1 ? 7 : (8 - today) % 7;

  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(12, 0, 0, 0);

  return d;
}

export type Days = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SCHEDULE_FIELD_DEFAULTS = () => {
  return {
    autoRun: signal(true),
    nextTime: {
      time: signal<string>('13:00'),
      date: signal<string>(new Date().toISOString().split('T')[0]),
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

@Component({
  selector: 'app-schedule',
  imports: [
    FormsModule,
    ShipFormField,
    ShipToggle,
    ShipIcon,
    ShipButton,
    ShipSelect,
    ShipToggleCard,
    ShipSelect,
    ShipDatepickerInput,
  ],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ScheduleComponent {
  #backupState = inject(BackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  unitOptions = UNIT_OPTIONS;
  scheduleFields = this.#backupState.scheduleFields;
  scheduleType = this.#backupState.scheduleType;
  scheduleOptions = SCHEDULE_DEFAULT_OPTIONS;

  updateScheduleType(newType: string) {
    const predefinedType = SCHEDULE_DEFAULT_OPTIONS.find((x) => x.value === newType);

    if (predefinedType && predefinedType?.value !== 'custom') {
      this.scheduleType.set(predefinedType.value);

      const data = predefinedType.data;

      this.scheduleFields.autoRun.set(data.autoRun ?? false);
      this.scheduleFields.nextTime.time.set(data.nextTime?.time ?? '13:00');
      this.scheduleFields.nextTime.date.set(data.nextTime?.date ?? new Date().toISOString().split('T')[0]);
      this.scheduleFields.runAgain.repeatValue.set(data.runAgain?.repeatValue ?? 1);
      this.scheduleFields.runAgain.repeatUnit.set(data.runAgain?.repeatUnit ?? 'D');
      this.scheduleFields.runAgain.allowedDays.mon.set(data.runAgain?.allowedDays?.mon ?? true);
      this.scheduleFields.runAgain.allowedDays.tue.set(data.runAgain?.allowedDays?.tue ?? true);
      this.scheduleFields.runAgain.allowedDays.wed.set(data.runAgain?.allowedDays?.wed ?? true);
      this.scheduleFields.runAgain.allowedDays.thu.set(data.runAgain?.allowedDays?.thu ?? true);
      this.scheduleFields.runAgain.allowedDays.fri.set(data.runAgain?.allowedDays?.fri ?? true);
      this.scheduleFields.runAgain.allowedDays.sat.set(data.runAgain?.allowedDays?.sat ?? true);
      this.scheduleFields.runAgain.allowedDays.sun.set(data.runAgain?.allowedDays?.sun ?? true);
    } else {
      this.scheduleType.set('custom');
    }
  }

  goBack() {
    this.#router.navigate(['source'], { relativeTo: this.#route.parent });
  }

  next() {
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }
}
