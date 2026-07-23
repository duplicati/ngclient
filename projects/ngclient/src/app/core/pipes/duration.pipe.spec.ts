import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAYJS } from '../providers/dayjs';
import { DurationFormatPipe } from './duration.pipe';

describe('DurationFormatPipe', () => {
  const humanize = vi.fn();
  const duration = vi.fn(() => ({ humanize }));
  let pipe: DurationFormatPipe;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [DurationFormatPipe, { provide: DAYJS, useValue: { duration } }],
    });
    pipe = TestBed.inject(DurationFormatPipe);
  });

  it.each([null, undefined, ''] as const)('returns an empty string for %s', (value) => {
    expect(pipe.transform(value)).toBe('');
  });

  it.each(['invalid', '1:2:03', '12:34'])('returns an empty string for an invalid duration: %s', (value) => {
    expect(pipe.transform(value)).toBe('');
  });

  it('humanizes a duration through Day.js', () => {
    humanize.mockReturnValue('3 days');

    expect(pipe.transform('2.03:04:05.123')).toBe('3 days');
    expect(duration).toHaveBeenCalledWith({ days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it('returns the exact duration when requested', () => {
    expect(pipe.transform('2.03:04:05', true)).toBe('2d 3h 4m 5s');
    expect(pipe.transform('03:04:05', true)).toBe('3h 4m 5s');
    expect(duration).not.toHaveBeenCalled();
  });
});
