import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../openapi';
import { PauseDialogComponent } from './pause-dialog.component';

describe('pause dialog request options and acknowledgement', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const response = new Subject<unknown>();
    const pause = vi.fn(() => response);
    const closed = vi.fn();
    TestBed.configureTestingModule({
      imports: [PauseDialogComponent],
      providers: [{ provide: DuplicatiServer, useValue: { postApiV1ServerstatePause: pause } }],
    });
    TestBed.overrideComponent(PauseDialogComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(PauseDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.closed.subscribe(closed);
    return { component, pause, response, closed };
  }
  it.each(['5m', '1h', undefined])('preserves the selected pause duration %s', (duration) => {
    const { component, pause, response } = setup();
    component.pauseOption.set(duration);
    component.submit();
    expect(pause).toHaveBeenCalledExactlyOnceWith({ query: { duration, pauseTransfers: null } });
    response.complete();
  });
  it('requests transfer pausing only when explicitly selected', () => {
    const { component, pause, response } = setup();
    component.pauseTransfers.set(true);
    component.pauseOption.set('24h');
    component.submit();
    expect(pause).toHaveBeenCalledExactlyOnceWith({ query: { duration: '24h', pauseTransfers: true } });
    response.complete();
  });
  it('waits for the server acknowledgement before closing and clears pending state on completion', () => {
    const { component, response, closed } = setup();
    component.submit();
    expect(component.isSubmitting()).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    response.next({});
    response.complete();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(component.isSubmitting()).toBe(false);
  });
  it('does not report a successful pause if the request completes without acknowledgement', () => {
    const { component, response, closed } = setup();
    component.submit();
    response.complete();
    expect(closed).not.toHaveBeenCalled();
    expect(component.isSubmitting()).toBe(false);
  });
});
