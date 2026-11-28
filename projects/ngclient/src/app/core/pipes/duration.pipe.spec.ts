import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DurationFormatPipe } from './duration.pipe';

describe('DurationFormatPipe', () => {
  let pipe: DurationFormatPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DurationFormatPipe],
    });
    pipe = TestBed.inject(DurationFormatPipe);
  });

  it.each([null, undefined, ''] as const)('returns an empty string for %s', (value) => {
    expect(pipe.transform(value)).toBe('');
  });

  it.each(['invalid', '1:2:03', '12:34'])('returns an empty string for an invalid duration: %s', (value) => {
    expect(pipe.transform(value)).toBe('');
  });

  it('formats the rounded duration as a localized unit', () => {
    expect(pipe.transform('00:00:05')).toBe('5 seconds');
    expect(pipe.transform('00:00:45')).toBe('1 minute');
    expect(pipe.transform('2.03:04:05.123')).toBe('2 days');
  });

  it('returns the exact duration when requested', () => {
    expect(pipe.transform('2.03:04:05', true)).toBe('2d 3h 4m 5s');
    expect(pipe.transform('03:04:05', true)).toBe('3h 4m 5s');
  });
});
