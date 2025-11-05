import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton, ShipFormField, ShipIcon, ShipSelect, ShipToggle, ShipToggleCard } from '@ship-ui/core';
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

export type Days = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SCHEDULE_FIELD_DEFAULTS = {
  autoRun: true,
  nextTime: { time: '13:00', date: new Date().toISOString().split('T')[0] },
  runAgain: {
    repeatValue: 1,
    repeatUnit: 'D' as string,
    allowedDays: {
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
      sun: false,
    },
  },
};

@Component({
  selector: 'app-schedule',
  imports: [FormsModule, ShipFormField, ShipToggle, ShipIcon, ShipButton, ShipSelect, ShipToggleCard],
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

  goBack() {
    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }

  next() {
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }
}
