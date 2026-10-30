import { By } from '@angular/platform-browser';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SizeComponent } from './size.component';

describe('SizeComponent form integration', () => {
  let fixture: ComponentFixture<SizeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function setup(inputType?: string) {
    TestBed.configureTestingModule({ imports: [SizeComponent] });
    fixture = TestBed.createComponent(SizeComponent);
    if (inputType) fixture.componentRef.setInput('inputType', inputType);
    await settle();
    return fixture.componentInstance;
  }

  it.each([
    ['24kb', 24, 'KB'],
    ['512MB', 512, 'MB'],
    ['2GB', 2, 'GB'],
    ['0TB', 0, 'TB'],
  ] as const)('restores %s into the number and unit controls', async (value, count, unit) => {
    const component = await setup();
    component.writeValue(value);
    await settle();
    expect(fixture.nativeElement.querySelector('input[type=number]').value).toBe(String(count));
    expect(fixture.nativeElement.querySelector('sh-select input').value).toBe(unit);
  });

  it('propagates number edits and unit changes as server size strings', async () => {
    const component = await setup();
    const changed = vi.fn();
    component.registerOnChange(changed);
    const number = fixture.nativeElement.querySelector('input[type=number]');
    number.value = '64';
    number.dispatchEvent(new Event('input'));
    await settle();
    expect(changed).toHaveBeenLastCalledWith('64MB');
    component.unit.set('GB');
    await settle();
    expect(changed).toHaveBeenLastCalledWith('64GB');
  });

  it('clears a previously loaded size when the form supplies an empty value', async () => {
    const component = await setup();
    component.writeValue('8GB');
    await settle();
    component.writeValue('');
    await settle();
    expect(fixture.nativeElement.querySelector('input[type=number]').value).toBe('0');
    expect(component.unit()).toBe('MB');
  });

  it('disables and re-enables both size controls through the form interface', async () => {
    const component = await setup();
    component.setDisabledState!(true);
    await settle();
    expect(fixture.nativeElement.querySelector('input[type=number]').disabled).toBe(true);
    expect(fixture.debugElement.query(By.directive(ShipSelect)).componentInstance.readonly()).toBe(true);
    component.setDisabledState!(false);
    await settle();
    expect(fixture.nativeElement.querySelector('input[type=number]').disabled).toBe(false);
    expect(fixture.debugElement.query(By.directive(ShipSelect)).componentInstance.readonly()).toBe(false);
  });

  it.each(['throttle-upload', 'throttle-download'])('uses per-second labels for %s only', async (inputType) => {
    const component = await setup(inputType);
    expect(component.hasPerSecond()).toBe(true);
    fixture.componentRef.setInput('inputType', 'dblock-size');
    expect(component.hasPerSecond()).toBe(false);
  });
});
