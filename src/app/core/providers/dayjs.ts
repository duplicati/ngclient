import { InjectionToken, Provider } from '@angular/core';
import dayjs from 'dayjs/esm';
import duration from 'dayjs/esm/plugin/duration';
import relativeTime from 'dayjs/esm/plugin/relativeTime';
import { DAYJS_LOCALES } from '../locales/dayjs.const';

export const DAYJS = new InjectionToken<typeof dayjs>('Dayjs');

export const DayJsProvider: Provider = {
  provide: DAYJS,
  useFactory: () => {
    const locale = localStorage.getItem('v1:duplicati:locale') ?? 'en-US';
    const simpleLocale = locale.split('-')[0];

    dayjs.extend(relativeTime);
    dayjs.extend(duration);
    dayjs.locale(DAYJS_LOCALES[simpleLocale]);

    return dayjs;
  },
};
