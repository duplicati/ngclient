import { DatePipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { relativeTimeMagnitude } from './relative-time-magnitude';
import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  const datePipe = { transform: vi.fn() };
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [RelativeTimePipe, { provide: DatePipe, useValue: datePipe }],
    });
    pipe = TestBed.inject(RelativeTimePipe);
  });

  it.each([null, undefined, ''] as const)('returns N/A for %s', (value) => {
    expect(pipe.transform(value)).toBe('N/A');
  });

  it('formats the actual date when requested', () => {
    const value = new Date('2026-06-14T08:50:00Z');
    datePipe.transform.mockReturnValue('6/14/26, 8:50 AM');

    expect(pipe.transform(value, true)).toBe('6/14/26, 8:50 AM');
    expect(datePipe.transform).toHaveBeenCalledWith(value, 'short');
  });

  it('converts a basic ISO timestamp before calculating relative time', () => {
    vi.useFakeTimers({ now: new Date('2026-06-14T08:50:05Z'), toFake: ['Date'] });
    try {
      expect(pipe.transform('20260614T085000Z')).toBe('5 seconds ago');
      expect(pipe.transform('2026-06-14T08:50:10Z')).toBe('in 5 seconds');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [44_000, 44, 'second'],
    [44_500, 1, 'minute'],
    [89_000, 1, 'minute'],
    [90_000, 2, 'minute'],
    [44.5 * 60_000, 1, 'hour'],
    [21.5 * 3_600_000, 1, 'day'],
    [35.5 * 3_600_000, 1, 'day'],
    [25.5 * 86_400_000, 1, 'month'],
  ] as const)('preserves the legacy unit boundary at %i ms', (elapsed, amount, unit) => {
    const reference = new Date('2026-01-01T12:00:00Z');
    expect(relativeTimeMagnitude(new Date(reference.getTime() + elapsed), reference)).toEqual([amount, unit]);
  });

  it('uses calendar months when rounding long intervals', () => {
    const reference = new Date(2025, 0, 31, 12);
    expect(relativeTimeMagnitude(new Date(2025, 2, 31, 12), reference)).toEqual([2, 'month']);
    expect(relativeTimeMagnitude(new Date(2026, 6, 31, 12), reference)).toEqual([2, 'year']);
  });
});
