import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimespanComponent } from './timespan.component';

describe('TimespanComponent form values', () => {
  let fixture: ComponentFixture<TimespanComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function setup(inputType?: string) {
    TestBed.configureTestingModule({ imports: [TimespanComponent] });
    fixture = TestBed.createComponent(TimespanComponent);
    if (inputType) fixture.componentRef.setInput('inputType', inputType);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('defaults calendar fields to days and distinguishes months from minutes', async () => {
    const component = await setup();
    expect(component.unit()).toBe('D');
    expect(component.timeOptions().map((x) => x.value)).toEqual(['Y', 'M', 'W', 'D']);
    component.writeValue('3M');
    fixture.detectChanges();
    expect(component.timespan()).toBe(3);
    expect(component.unitLabel()).toBe('Months');
  });

  it.each(['retry-delay', '--web-timeout', 'run-script-timeout'])(
    'uses seconds and short time units for %s',
    async (inputType) => {
      const component = await setup(inputType);
      expect(component.unit()).toBe('s');
      expect(component.timeOptions().map((x) => x.value)).toEqual(['s', 'm', 'h']);
      component.writeValue('15m');
      fixture.detectChanges();
      expect(component.timespan()).toBe(15);
      expect(component.unitLabel()).toBe('Minutes');
    }
  );

  it.each([
    ['2Y', 2, 'Y'],
    ['4W', 4, 'W'],
    ['0D', 0, 'D'],
  ] as const)('loads calendar duration %s', async (value, count, unit) => {
    const component = await setup();
    component.writeValue(value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.timespan()).toBe(count);
    expect(component.unit()).toBe(unit);
    expect(fixture.nativeElement.querySelector('input[type=number]').value).toBe(String(count));
  });

  it('resets empty, malformed or incompatible values to the current field default', async () => {
    const component = await setup();
    for (const value of ['', 'invalid', '2W3D', '5h']) {
      component.writeValue('4W');
      component.writeValue(value);
      expect(component.timespan()).toBe(0);
      expect(component.unit()).toBe('D');
    }
    fixture.componentRef.setInput('inputType', '--retry-delay');
    fixture.detectChanges();
    component.writeValue('5h');
    component.writeValue('invalid');
    expect(component.timespan()).toBe(0);
    expect(component.unit()).toBe('s');
  });

  it('updates form values when either the number or unit changes', async () => {
    const component = await setup();
    const changed = vi.fn();
    component.registerOnChange(changed);
    component.timespan.set(8);
    fixture.detectChanges();
    expect(changed).toHaveBeenLastCalledWith('8D');
    component.updateUnit('W');
    fixture.detectChanges();
    expect(changed).toHaveBeenLastCalledWith('8W');
  });

  it('switches the default and choices when reused for a different field type', async () => {
    const component = await setup('retry-delay');
    component.writeValue('2h');
    fixture.componentRef.setInput('inputType', 'retention');
    fixture.detectChanges();
    expect(component.timeOptions().map((x) => x.value)).toEqual(['Y', 'M', 'W', 'D']);
    component.writeValue('');
    expect(component.unit()).toBe('D');
  });

  it('disables and re-enables the numeric input through the form control interface', async () => {
    const component = await setup();
    component.setDisabledState!(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=number]').disabled).toBe(true);
    component.setDisabledState!(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=number]').disabled).toBe(false);
  });
});
