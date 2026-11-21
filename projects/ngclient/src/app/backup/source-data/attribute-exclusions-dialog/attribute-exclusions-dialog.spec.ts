import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttributeExclusionsDialog } from './attribute-exclusions-dialog';

describe('attribute exclusion choices', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('retains unknown attributes and matches configured selections case-insensitively', () => {
    const fixture = TestBed.createComponent(AttributeExclusionsDialog);
    fixture.componentRef.setInput('data', {
      options: ['Hidden', 'System', 'Archive'],
      selected: ['hIdDeN', 'LegacyAttribute'],
    });
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();

    const [hidden, system, archive, legacy] = fixture.nativeElement.querySelectorAll(
      'input[type=checkbox]:not(.internal-input)'
    );
    expect(hidden.checked).toBe(true);
    expect(system.checked).toBe(false);
    expect(legacy.checked).toBe(true);
    archive.click();
    hidden.click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.primary') as HTMLButtonElement).click();

    expect(closed).toHaveBeenCalledExactlyOnceWith(['Archive', 'LegacyAttribute']);
  });
});
