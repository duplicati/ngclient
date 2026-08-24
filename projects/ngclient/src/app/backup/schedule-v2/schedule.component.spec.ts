/// <reference types="@angular/localize" />

import { describe, expect, it } from 'vitest';
import { formatAllowedDays, formatRepeatInterval } from './schedule-summary';

describe('schedule summary formatting', () => {
  it.each([
    ['s', 'second', 'seconds'],
    ['m', 'minute', 'minutes'],
    ['h', 'hour', 'hours'],
    ['D', 'day', 'days'],
    ['W', 'week', 'weeks'],
    ['M', 'month', 'months'],
    ['Y', 'year', 'years'],
  ])('formats singular and plural %s intervals', (unit, singular, plural) => {
    expect(formatRepeatInterval(1, unit)).toBe(`Every 1 ${singular}`);
    expect(formatRepeatInterval(2, unit)).toBe(`Every 2 ${plural}`);
  });

  it('formats all allowed days', () => {
    expect(formatAllowedDays({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true })).toBe(
      'Every day'
    );
  });

  it('formats no allowed days', () => {
    expect(
      formatAllowedDays({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
    ).toBe('No days selected');
  });

  it('formats a subset of allowed days', () => {
    expect(formatAllowedDays({ mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false })).toBe(
      'Monday, Wednesday, Friday'
    );
  });
});
