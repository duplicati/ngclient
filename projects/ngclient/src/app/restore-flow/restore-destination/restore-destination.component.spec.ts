import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { RestoreFlowState } from '../restore-flow.state';
import RestoreDestinationComponent from './restore-destination.component';

describe('direct restore target URL Signal Form', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(url: string | null = 'file:///original') {
    const target = signal(url);
    const update = vi.fn((value: string | null) => target.set(value));
    TestBed.configureTestingModule({
      imports: [RestoreDestinationComponent],
      providers: [
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: ShipDialogService, useValue: {} },
        {
          provide: RestoreFlowState,
          useValue: {
            destinationTargetUrl: target,
            destinationTestSignal: signal(null),
            destinationConnectionStringId: signal(null),
            updateTargetUrl: update,
          },
        },
        {
          provide: ConnectionStringsState,
          useValue: {
            resourceDestinations: { isLoading: signal(false), error: signal(undefined), hasValue: () => false },
          },
        },
      ],
    }).overrideComponent(RestoreDestinationComponent, { set: { template: '', imports: [], providers: [] } });
    const fixture = TestBed.createComponent(RestoreDestinationComponent);
    return { component: fixture.componentInstance, target, update };
  }
  it('opens with the current URL and retains edits locally until explicitly applied', () => {
    const { component, target, update } = setup();
    component.openTargetUrlDialog();
    expect(component.targetUrlForm.url().value()).toBe('file:///original');
    const url = 'ssh://user@host/path with spaces?auth-password=a%2Bb&x=a%26b';
    component.targetUrlForm.url().value.set(url);
    expect(target()).toBe('file:///original');
    expect(update).not.toHaveBeenCalled();
    component.closeTargetUrlDialog(true);
    expect(update).toHaveBeenCalledExactlyOnceWith(url);
    expect(component.targetUrlDialogOpen()).toBe(false);
  });
  it('discards cancelled edits when the dialog is reopened', () => {
    const { component, update } = setup();
    component.openTargetUrlDialog();
    component.targetUrlForm.url().value.set('file:///cancelled');
    component.closeTargetUrlDialog(false);
    expect(update).not.toHaveBeenCalled();
    component.openTargetUrlDialog();
    expect(component.targetUrlForm.url().value()).toBe('file:///original');
  });
  it.each([null, '', 'file:///original'])('does not overwrite the destination with %j', (value) => {
    const { component, update } = setup();
    component.openTargetUrlDialog();
    component.targetUrlForm.url().value.set(value);
    component.closeTargetUrlDialog(true);
    expect(update).not.toHaveBeenCalled();
  });
  it('initializes an empty destination as null and reloads external changes on open', () => {
    const { component, target } = setup(null);
    component.openTargetUrlDialog();
    expect(component.targetUrlForm.url().value()).toBeNull();
    component.closeTargetUrlDialog();
    target.set('file:///external');
    component.openTargetUrlDialog();
    expect(component.targetUrlForm.url().value()).toBe('file:///external');
  });
});
