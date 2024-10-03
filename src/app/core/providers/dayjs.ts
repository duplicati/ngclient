import { InjectionToken, Provider } from '@angular/core';
import dayjs from 'dayjs/esm';
import duration from 'dayjs/esm/plugin/duration';
import relativeTime from 'dayjs/esm/plugin/relativeTime';

export const DAYJS = new InjectionToken<typeof dayjs>('Dayjs');

export const DayJsProvider: Provider = {
  provide: DAYJS,
  useFactory: () => {
    dayjs.extend(relativeTime);
    dayjs.extend(duration);

    return dayjs;
  },
};
