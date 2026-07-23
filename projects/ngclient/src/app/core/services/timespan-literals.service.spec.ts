import { describe, expect, it } from 'vitest';
import { TimespanLiteralsService } from './timespan-literals.service';

describe('TimespanLiteralsService', () => {
  const service = new TimespanLiteralsService();

  it.each([
    ['0s', { value: 0, unit: 's' }],
    ['15m', { value: 15, unit: 'm' }],
    ['24h', { value: 24, unit: 'h' }],
    ['7D', { value: 7, unit: 'D' }],
    ['2W', { value: 2, unit: 'W' }],
    ['6M', { value: 6, unit: 'M' }],
    ['1Y', { value: 1, unit: 'Y' }],
  ] as const)('parses %s', (value, expected) => {
    expect(service.fromString(value)).toEqual(expected);
  });

  it.each([null, undefined, '', 'invalid'])('returns null for %s', (value) => {
    expect(service.fromString(value)).toBeNull();
  });

  it('serializes a value and unit', () => {
    expect(service.toString(12, 'h')).toBe('12h');
  });
});
