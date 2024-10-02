import { InjectionToken, Provider } from '@angular/core';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';

export const DAYJS = new InjectionToken<typeof dayjs>('Dayjs');

export const DayJsProvider: Provider = {
  provide: DAYJS,
  useFactory: () => {
    dayjs.extend(relativeTime);
    dayjs.extend(duration);

    return dayjs;
  },
};
