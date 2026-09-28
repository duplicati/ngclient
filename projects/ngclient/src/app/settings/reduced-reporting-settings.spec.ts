import { describe, expect, it } from 'vitest';
import { toReducedReportingState } from './reduced-reporting-settings';

describe('reduced reporting settings', () => {
  it('is off when neither setting is set', () => {
    expect(toReducedReportingState({})).toEqual({ local: false, console: false, active: false, canDisable: true });
    expect(toReducedReportingState(undefined)).toEqual({ local: false, console: false, active: false, canDisable: true });
  });

  it('is active and can be disabled when only the operator switched it on', () => {
    expect(toReducedReportingState({ 'reduced-reporting': 'True' })).toEqual({
      local: true,
      console: false,
      active: true,
      canDisable: true,
    });
  });

  it('is active and locked when the console enforces it', () => {
    expect(toReducedReportingState({ 'reduced-reporting-console': 'True' })).toEqual({
      local: false,
      console: true,
      active: true,
      canDisable: false,
    });
  });

  it('stays locked when both the operator and the console set it', () => {
    expect(toReducedReportingState({ 'reduced-reporting': 'true', 'reduced-reporting-console': 'TRUE' })).toEqual({
      local: true,
      console: true,
      active: true,
      canDisable: false,
    });
  });

  it.each(['False', 'false', '', 'yes', '1', null, undefined])('treats %s as not set', (value) => {
    expect(toReducedReportingState({ 'reduced-reporting': value, 'reduced-reporting-console': value }).active).toBe(false);
  });
});
