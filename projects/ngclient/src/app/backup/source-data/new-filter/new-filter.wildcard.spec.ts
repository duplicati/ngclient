import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewFilterComponent } from './new-filter.component';

describe('NewFilterComponent wildcard expressions (#579)', () => {
  afterEach(() => TestBed.resetTestingModule());
  it.each([
    ['-', 'Linux'],
    ['+', 'Linux'],
    ['-', 'Windows'],
    ['+', 'Windows'],
  ])('preserves the first typed wildcard for %sExpression on %s through parent feedback', (direction, osType) => {
    TestBed.configureTestingModule({ imports: [NewFilterComponent] });
    const fixture = TestBed.createComponent(NewFilterComponent);
    fixture.componentRef.setInput('path', direction + 'old');
    fixture.componentRef.setInput('osType', osType);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const changed = vi.fn((path: string) => fixture.componentRef.setInput('path', path));
    component.pathChange.subscribe(changed);

    component.internalPath.set('*');
    component.updateFilter();
    expect(changed).toHaveBeenCalledExactlyOnceWith(direction + '*');
    fixture.detectChanges();
    expect(component.internalPath()).toBe('*');
    expect(component.pathType()).toBe(direction + 'Expression');

    changed.mockClear();
    component.updateFilter();
    expect(changed).toHaveBeenCalledExactlyOnceWith(direction + '*');
  });
  it('does not emit an empty expression while the input is being cleared', () => {
    TestBed.configureTestingModule({ imports: [NewFilterComponent] });
    const fixture = TestBed.createComponent(NewFilterComponent);
    fixture.componentRef.setInput('path', '-old');
    fixture.detectChanges();
    const changed = vi.fn();
    fixture.componentInstance.pathChange.subscribe(changed);
    fixture.componentInstance.internalPath.set('');
    fixture.componentInstance.updateFilter();
    expect(changed).not.toHaveBeenCalled();
  });
});
