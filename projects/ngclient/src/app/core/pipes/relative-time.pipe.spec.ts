import { DatePipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DAYJS } from '../providers/dayjs';
import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  const fromNow = vi.fn();
  const dayjs = Object.assign(
    vi.fn(() => ({ fromNow })),
    { locale: vi.fn() }
  );
  const datePipe = { transform: vi.fn() };
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [RelativeTimePipe, { provide: DAYJS, useValue: dayjs }, { provide: DatePipe, useValue: datePipe }],
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
    expect(dayjs).not.toHaveBeenCalled();
  });

  it('converts a basic ISO timestamp before calculating relative time', () => {
    fromNow.mockReturnValue('a few seconds ago');

    expect(pipe.transform('20260614T085000Z')).toBe('a few seconds ago');
    expect(dayjs.locale).toHaveBeenCalledOnce();
    expect(dayjs).toHaveBeenCalledWith('2026-06-14T08:50:00Z');
  });

  it('passes other supported values directly to Day.js', () => {
    const value = new Date('2026-06-14T08:50:00Z');
    fromNow.mockReturnValue('a month ago');

    expect(pipe.transform(value)).toBe('a month ago');
    expect(dayjs).toHaveBeenCalledWith(value);
  });
});
