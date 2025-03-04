import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { BackupState } from '../backup.state';

const fb = new FormBuilder();

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

type Unit = (typeof UNIT_OPTIONS)[number]['key'];
export type Days = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const createScheduleForm = (
  defaults = {
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
  }
) => {
  return fb.group({
    autoRun: fb.control<boolean>(defaults.autoRun),
    nextTime: fb.group({
      time: fb.control<string>(defaults.nextTime.time),
      date: fb.control<string>(defaults.nextTime.date),
    }),
    runAgain: fb.group({
      repeatValue: fb.control<number>(defaults.runAgain.repeatValue),
      repeatUnit: fb.control<string>(defaults.runAgain.repeatUnit),
      allowedDays: fb.group({
        mon: fb.control<boolean>(defaults.runAgain.allowedDays.mon),
        tue: fb.control<boolean>(defaults.runAgain.allowedDays.tue),
        wed: fb.control<boolean>(defaults.runAgain.allowedDays.wed),
        thu: fb.control<boolean>(defaults.runAgain.allowedDays.thu),
        fri: fb.control<boolean>(defaults.runAgain.allowedDays.fri),
        sat: fb.control<boolean>(defaults.runAgain.allowedDays.sat),
        sun: fb.control<boolean>(defaults.runAgain.allowedDays.sun),
      }),
    }),
  });
};

export type ScheduleFormValue = ReturnType<typeof createScheduleForm>['value'];

@Component({
  selector: 'app-schedule',
  imports: [
    ReactiveFormsModule,
    SparkleFormFieldComponent,
    SparkleToggleComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleSelectComponent,
    ToggleCardComponent,
  ],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ScheduleComponent {
  #backupState = inject(BackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  scheduleForm = this.#backupState.scheduleForm;
  scheduleFormSignal = this.#backupState.scheduleFormSignal;
  unitOptions = UNIT_OPTIONS;

  displayFn(val: Unit) {
    const item = UNIT_OPTIONS.find((x) => x.key === val);

    if (!item) {
      return '';
    }
    return `${item.label}`;
  }

  goBack() {
    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }

  next() {
    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }
}
