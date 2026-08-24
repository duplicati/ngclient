/// <reference types="@angular/localize" />

import dayjs from 'dayjs/esm';
import { describe, expect, it } from 'vitest';
import { formatAllowedDays } from './schedule-summary';

describe('schedule summary formatting', () => {
  it('formats all allowed days', () => {
    expect(
      formatAllowedDays(dayjs, { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true })
    ).toBe('All days');
  });

  it('formats no allowed days', () => {
    expect(
      formatAllowedDays(dayjs, { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
    ).toBe('No days selected');
  });

  it('formats a subset of allowed days', () => {
    expect(
      formatAllowedDays(dayjs, { mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false })
    ).toBe('Monday, Wednesday, and Friday');
  });
});
