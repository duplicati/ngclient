import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SizeComponent } from './size/size.component';
import { TimespanComponent } from './timespan/timespan.component';

describe('form control initialization', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not echo asynchronous size writes and still reports subsequent edits', async () => {
    TestBed.configureTestingModule({ imports: [SizeComponent] });
    const fixture = TestBed.createComponent(SizeComponent);
    const changed = vi.fn();
    fixture.componentInstance.registerOnChange(changed);
    fixture.componentInstance.writeValue('64MB');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.timespan()).toBe(64);
    expect(changed).not.toHaveBeenCalled();
    fixture.componentInstance.timespan.set(128);
    fixture.detectChanges();
    expect(changed).toHaveBeenLastCalledWith('128MB');
    fixture.componentInstance.writeValue('2GB');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('keeps the latest size write when a pending initialization is replaced', async () => {
    TestBed.configureTestingModule({ imports: [SizeComponent] });
    const fixture = TestBed.createComponent(SizeComponent);
    const changed = vi.fn();
    fixture.componentInstance.registerOnChange(changed);
    fixture.componentInstance.writeValue('64MB');
    fixture.componentInstance.writeValue('');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.timespan()).toBe(0);
    expect(fixture.componentInstance.unit()).toBe('MB');
    expect(changed).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('does not echo timespan writes or replace a loaded unit during initialization', () => {
    TestBed.configureTestingModule({ imports: [TimespanComponent] });
    const fixture = TestBed.createComponent(TimespanComponent);
    fixture.componentRef.setInput('inputType', 'web-timeout');
    const changed = vi.fn();
    fixture.componentInstance.registerOnChange(changed);
    fixture.componentInstance.writeValue('2m');
    fixture.detectChanges();
    expect(fixture.componentInstance.timespan()).toBe(2);
    expect(fixture.componentInstance.unit()).toBe('m');
    expect(changed).not.toHaveBeenCalled();
    fixture.componentInstance.updateUnit('h');
    fixture.detectChanges();
    expect(changed).toHaveBeenLastCalledWith('2h');
    fixture.componentInstance.writeValue('5s');
    fixture.detectChanges();
    expect(changed).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('replaces a unit that the new input type does not offer, without reporting a change', () => {
    TestBed.configureTestingModule({ imports: [TimespanComponent] });
    const fixture = TestBed.createComponent(TimespanComponent);
    fixture.componentRef.setInput('inputType', 'retention-policy');
    const changed = vi.fn();
    fixture.componentInstance.registerOnChange(changed);
    fixture.componentInstance.writeValue('2W');
    fixture.detectChanges();
    expect(fixture.componentInstance.unit()).toBe('W');
    fixture.componentRef.setInput('inputType', 'web-timeout');
    fixture.detectChanges();
    expect(fixture.componentInstance.unit()).toBe('s');
    expect(changed).not.toHaveBeenCalled();
    fixture.componentInstance.writeValue('3m');
    fixture.componentRef.setInput('inputType', 'read-write-timeout');
    fixture.detectChanges();
    expect(fixture.componentInstance.unit()).toBe('m');
    expect(changed).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
