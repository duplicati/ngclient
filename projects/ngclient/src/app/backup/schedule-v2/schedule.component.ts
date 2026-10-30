import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDatepickerInput } from '@ship-ui/core/ship-datepicker';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import { ShipToggleCard } from '@ship-ui/core/ship-toggle-card';
import { DAYJS } from '../../core/providers/dayjs';
import { BackupState } from '../backup.state';
import { getLocalDateParts, getNextRunDate, SCHEDULE_DEFAULT_OPTIONS } from '../models/schedule-form';
import { formatAllowedDays } from './schedule-summary';

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
  #dayjs = inject(DAYJS);

  unitOptions = UNIT_OPTIONS;
  scheduleFields = this.#backupState.scheduleFields;
  datepickerDate = computed(() => {
    const value = this.scheduleFields.nextTime.date();
    if (!value) return null;

    // The picker parses strings with new Date(), treating YYYY-MM-DD as UTC.
    // Pass the selected calendar day as a local Date instead.
    const { year, month, day } = getLocalDateParts(value);
    return new Date(year, month, day);
  });
  scheduleType = this.#backupState.scheduleType;
  scheduleOptions = SCHEDULE_DEFAULT_OPTIONS;
  scheduleSummary = computed(() => {
    if (!this.scheduleFields.autoRun()) {
      return {
        autoRun: false as const,
      };
    }

    const allowedDays = this.scheduleFields.runAgain.allowedDays;

    return {
      autoRun: true as const,
      date: this.scheduleFields.nextTime.date(),
      time: this.scheduleFields.nextTime.time(),
      repeatValue: this.scheduleFields.runAgain.repeatValue(),
      repeatUnit: this.scheduleFields.runAgain.repeatUnit(),
      allowedDays: formatAllowedDays(this.#dayjs, {
        mon: allowedDays.mon(),
        tue: allowedDays.tue(),
        wed: allowedDays.wed(),
        thu: allowedDays.thu(),
        fri: allowedDays.fri(),
        sat: allowedDays.sat(),
        sun: allowedDays.sun(),
      }),
    };
  });

  updateScheduleType(newType: string) {
    const predefinedType = SCHEDULE_DEFAULT_OPTIONS.find((x) => x.value === newType);

    if (predefinedType && predefinedType?.value !== 'custom') {
      this.scheduleType.set(predefinedType.value);

      const data = predefinedType.data;

      this.scheduleFields.autoRun.set(data.autoRun ?? false);
      const time = data.nextTime?.time ?? '13:00';

      // Compute the start when the preset is picked, as the page may have been open since an earlier day
      this.scheduleFields.nextTime.time.set(time);
      this.scheduleFields.nextTime.date.set(
        getNextRunDate(time, new Date(), predefinedType.value === 'weekly' ? 1 : undefined)
      );
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
    this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
  }

  next() {
    if (this.#backupState.shouldAutoSave()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }
}
