import { DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BytesPipe } from './byte.pipe';

describe('BytesPipe', () => {
  let pipe: BytesPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BytesPipe, DecimalPipe],
    });
    pipe = TestBed.inject(BytesPipe);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([null, undefined, '', 'not-a-number'] as const)('returns an empty string for %s', (value) => {
    expect(pipe.transform(value)).toBe('');
  });

  it('hides zero by default', () => {
    expect(pipe.transform(0)).toBe('');
  });

  it('formats zero when it is explicitly allowed', () => {
    expect(pipe.transform(0, false, true)).toBe('0B');
    expect(pipe.transform(0, true, true)).toBe('0 Bytes');
  });

  it('uses binary units on non-Mac platforms', () => {
    expect(pipe.transform(1536)).toBe('1.5 KiB');
    expect(pipe.transform(1536, true)).toBe('1.5 KiB');
  });

  it('uses decimal units on Mac platforms', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X)');

    expect(pipe.transform(1500)).toBe('1.5 KB');
  });

  it('accepts numeric strings', () => {
    expect(pipe.transform('2048')).toBe('2 KiB');
  });
});
