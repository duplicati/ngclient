import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { QueueCompletionAction } from '../../core/openapi';
import { StartAllDialog, StartAllDialogResult } from './start-all-dialog';

describe('start all dialog', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(afterActions: QueueCompletionAction[] = ['Shutdown', 'Reboot']) {
    const fixture = TestBed.createComponent(StartAllDialog);
    fixture.componentRef.setInput('data', {
      backups: [
        { id: '1', name: 'Alpha' },
        { id: '2', name: 'Beta' },
        { id: '3', name: 'Gamma' },
      ],
      afterActions,
    });
    const emitted: Array<StartAllDialogResult | null> = [];
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
    expect(emitted).toEqual([{ ids: ['1', '2', '3'], afterAction: 'None' }]);
  });

  it('emits only the picked backups, in the listed order', () => {
    const { component, emitted } = setup();

    component.selectNone();
    component.toggle('3', true);
    component.toggle('1', true);
    expect(component.allSelected()).toBe(false);

    component.submit();
    expect(emitted).toEqual([{ ids: ['1', '3'], afterAction: 'None' }]);
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

  function values(component: StartAllDialog) {
    return component.afterActionOptions().map((x) => x.value);
  }

  it('does nothing after the queue unless an action is picked', () => {
    const { fixture, component, emitted } = setup();

    expect(fixture.nativeElement.querySelector('sh-select')).not.toBeNull();
    expect(values(component)).toEqual(['None', 'Shutdown', 'Reboot']);
    expect(component.afterAction()).toBe('None');

    component.setAfterAction('Shutdown');
    component.submit();
    expect(emitted).toEqual([{ ids: ['1', '2', '3'], afterAction: 'Shutdown' }]);
  });

  it('goes back to doing nothing when the choice is changed or cleared', () => {
    const { component } = setup();

    component.setAfterAction('Shutdown');
    component.setAfterAction('Reboot');
    expect(component.afterAction()).toBe('Reboot');

    component.setAfterAction('None');
    expect(component.afterAction()).toBe('None');

    component.setAfterAction('Reboot');
    component.setAfterAction(null);
    expect(component.afterAction()).toBe('None');
  });

  it('hides the choice for a server that cannot shut down the computer', () => {
    const { fixture, component, emitted } = setup([]);

    expect(fixture.nativeElement.querySelector('sh-select')).toBeNull();

    component.setAfterAction('Shutdown');
    component.submit();
    expect(emitted).toEqual([{ ids: ['1', '2', '3'], afterAction: 'None' }]);
  });

  it('offers the script only when one is set on the server', () => {
    const { component: withoutScript } = setup();
    expect(values(withoutScript)).not.toContain('RunScript');

    TestBed.resetTestingModule();
    const { component, emitted } = setup(['RunScript']);
    expect(values(component)).toEqual(['None', 'RunScript']);

    component.setAfterAction('RunScript');
    component.submit();
    expect(emitted).toEqual([{ ids: ['1', '2', '3'], afterAction: 'RunScript' }]);
  });

  it('offers only the actions the server is allowed to perform', () => {
    const { component, emitted } = setup(['Reboot']);

    expect(values(component)).toEqual(['None', 'Reboot']);

    component.setAfterAction('Reboot');
    component.submit();
    expect(emitted).toEqual([{ ids: ['1', '2', '3'], afterAction: 'Reboot' }]);
  });
});
