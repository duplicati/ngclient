import { describe, expect, it } from 'vitest';
import { parseThrottleSpeed } from './throttle-speed';

describe('parseThrottleSpeed', () => {
  it('parses the unit suffixes the server accepts', () => {
    expect(parseThrottleSpeed('10MB')).toBe(10 * 1024 * 1024);
    expect(parseThrottleSpeed('512kb')).toBe(512 * 1024);
    expect(parseThrottleSpeed('1 GB')).toBe(1024 ** 3);
    expect(parseThrottleSpeed('2048')).toBe(2048);
    expect(parseThrottleSpeed('1.5MB')).toBe(1.5 * 1024 * 1024);
  });

  it('treats empty, zero and unparseable values as no throttle', () => {
    expect(parseThrottleSpeed(undefined)).toBeNull();
    expect(parseThrottleSpeed(null)).toBeNull();
    expect(parseThrottleSpeed('')).toBeNull();
    expect(parseThrottleSpeed('0')).toBeNull();
    expect(parseThrottleSpeed('0MB')).toBeNull();
    expect(parseThrottleSpeed('fast')).toBeNull();
    expect(parseThrottleSpeed('10XB')).toBeNull();
  });
});
