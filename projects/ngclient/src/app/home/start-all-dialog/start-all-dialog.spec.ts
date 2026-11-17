import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { StartAllDialog } from './start-all-dialog';

describe('start all dialog', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const fixture = TestBed.createComponent(StartAllDialog);
    fixture.componentRef.setInput('data', {
      backups: [
        { id: '1', name: 'Alpha' },
        { id: '2', name: 'Beta' },
        { id: '3', name: 'Gamma' },
      ],
    });
    const emitted: Array<string[] | null> = [];
    fixture.componentInstance.closed.subscribe((x) => emitted.push(x));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, emitted };
  }

  it('lists every backup and has them all picked to begin with', () => {
    const { fixture, component, emitted } = setup();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
    expect(component.allSelected()).toBe(true);

    component.submit();
    expect(emitted).toEqual([['1', '2', '3']]);
  });

  it('emits only the picked backups, in the listed order', () => {
    const { component, emitted } = setup();

    component.selectNone();
    component.toggle('3', true);
    component.toggle('1', true);
    expect(component.allSelected()).toBe(false);

    component.submit();
    expect(emitted).toEqual([['1', '3']]);
  });

  it('disables the start button when nothing is picked', () => {
    const { fixture, component } = setup();

    component.selectNone();
    fixture.detectChanges();

    const start = fixture.nativeElement.querySelector('footer button.primary') as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    component.selectAll();
    fixture.detectChanges();
    expect(start.disabled).toBe(false);
    expect(start.textContent).toContain('3 backups');
  });
});
