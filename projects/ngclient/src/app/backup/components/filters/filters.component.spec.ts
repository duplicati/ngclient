import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiltersComponent } from './filters.component';

describe('FiltersComponent', () => {
  let component: FiltersComponent;
  let fixture: ComponentFixture<FiltersComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FiltersComponent] });
    fixture = TestBed.createComponent(FiltersComponent);
    fixture.componentRef.setInput('filters', []);
    fixture.detectChanges();
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it.each([
    [[], false],
    [['-*.tmp'], false],
    [['-*'], true],
    [['-*.*'], true],
    [['-**'], true],
    [['+important', '-*'], false],
    [['-*', '+important'], true],
  ] as const)('reports the exclude-all warning for %j as %s', (filters, expected) => {
    component.filters.set([...filters]);

    expect(component.wrongConfiguration()).toBe(expected);
  });

  it('updates the exclude-all warning when filters change', () => {
    component.filters.set(['-*', '+important']);
    expect(component.wrongConfiguration()).toBe(true);

    component.filters.set(['+important', '-*']);
    expect(component.wrongConfiguration()).toBe(false);
  });

  it('loads the current filters into the bulk editor in order', () => {
    component.filters.set(['+important', '-*.tmp', '-cache/']);

    component.toggleBulkFilterEdit();

    expect(component.bulkFilterEditMode()).toBe(true);
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('+important\n-*.tmp\n-cache/');
    textarea.dispatchEvent(new Event('blur'));
    expect(component.bulkFilterEditMode()).toBe(true);
  });

  it('normalizes and deduplicates filters saved from the bulk editor', () => {
    component.toggleBulkFilterEdit();
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = `
      +important
      invalid
      -*.tmp
      +important

      -cache/
    `;
    textarea.dispatchEvent(new Event('input'));
    expect(component.filters()).toEqual([]);

    textarea.dispatchEvent(new Event('blur'));

    expect(component.filters()).toEqual(['+important', '-*.tmp', '-cache/']);
    expect(component.bulkFilterEditMode()).toBe(false);
  });

  it('adds the default filter and records its index without using DOM scrolling', () => {
    component.filters.set(['+important', '-*.tmp']);
    vi.spyOn(component, 'scrollToFilter').mockImplementation(() => undefined);

    component.addFilter();

    expect(component.filters()).toEqual(['+important', '-*.tmp', '-*.lock']);
    expect(component.lastAddedIndex()).toBe(2);
  });

  it('updates only the selected filter and clears the added index', () => {
    component.filters.set(['+important', '-*.tmp', '-cache/']);
    component.lastAddedIndex.set(1);

    component.updateFilterAt('-*.log', 1);

    expect(component.filters()).toEqual(['+important', '-*.log', '-cache/']);
    expect(component.lastAddedIndex()).toBeNull();
  });

  it('removes only the selected filter and clears the added index', () => {
    component.filters.set(['+important', '-*.tmp', '-cache/']);
    component.lastAddedIndex.set(2);

    component.removeFilterAt(1);

    expect(component.filters()).toEqual(['+important', '-cache/']);
    expect(component.lastAddedIndex()).toBeNull();
  });
});
