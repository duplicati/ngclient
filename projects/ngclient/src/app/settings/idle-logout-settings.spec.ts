import { describe, expect, it } from 'vitest';
import { toIdleLogoutLabel, toIdleLogoutMinutes, toIdleLogoutOptions } from './idle-logout-settings';

describe('idle logout settings', () => {
  it.each<[number, string]>([
    [0, 'Never sign out automatically'],
    [5, 'After 5 minutes without activity'],
    [90, 'After 90 minutes without activity'],
    [60, 'After 1 hour without activity'],
    [240, 'After 4 hours without activity'],
  ])('labels %s minutes as %s', (minutes, label) => {
    expect(toIdleLogoutLabel(minutes)).toBe(label);
  });

  it('offers off first and the choices in ascending order', () => {
    expect(toIdleLogoutOptions(0).map((option) => option.value)).toEqual(['0', '5', '15', '30', '60', '120', '240']);
  });

  it('keeps a stored value that is not one of the choices', () => {
    expect(toIdleLogoutOptions(45).map((option) => option.value)).toEqual([
      '0',
      '5',
      '15',
      '30',
      '45',
      '60',
      '120',
      '240',
    ]);
  });

  it('reads the selected minutes from the select', () => {
    const options = toIdleLogoutOptions(0);

    expect(toIdleLogoutMinutes([{ value: '15', label: 'x' }], options)).toBe(15);
    expect(toIdleLogoutMinutes([{ value: '0', label: 'x' }], options)).toBe(0);
    expect(toIdleLogoutMinutes([{ value: '7', label: 'x' }], options)).toBeNull();
    expect(toIdleLogoutMinutes([], options)).toBeNull();
  });
});
