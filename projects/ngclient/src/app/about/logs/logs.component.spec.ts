import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Event, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LogsComponent from './logs.component';
import { LogsLiveState } from './logs-live/logs-live.state';

describe('LogsComponent router subscription lifecycle', () => {
  let fixture: ComponentFixture<LogsComponent> | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    TestBed.resetTestingModule();
  });

  function setup() {
    const events = new Subject<Event>();
    const state = {
      logLevel: signal('Information'),
      logLevelByLabel: signal({}),
      isPolling: signal(false),
      updateLogLevel: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [LogsComponent],
      providers: [
        { provide: Router, useValue: { url: '/about/logs/stored', events } },
        { provide: LogsLiveState, useValue: state },
      ],
    }).overrideComponent(LogsComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(LogsComponent);
    return { component: fixture.componentInstance, events, state };
  }

  it('initializes from the current URL and only follows completed navigation redirects', () => {
    const { component, events } = setup();
    expect(component.currentUrl()).toBe('/about/logs/stored');
    events.next(new NavigationStart(1, '/about/logs/live'));
    expect(component.currentUrl()).toBe('/about/logs/stored');
    events.next(new NavigationEnd(1, '/about/logs', '/about/logs/live'));
    expect(component.currentUrl()).toBe('/about/logs/live');
  });

  it('releases the Router subscription when the view is destroyed', () => {
    const { events } = setup();
    expect(events.observed).toBe(true);
    fixture!.destroy();
    expect(events.observed).toBe(false);
  });

  it('does not update a destroyed view on later navigation', () => {
    const { component, events } = setup();
    fixture!.destroy();
    events.next(new NavigationEnd(1, '/about/logs', '/about/logs/live'));
    expect(component.currentUrl()).toBe('/about/logs/stored');
  });

  it('only updates the new view after leaving and reopening logs', () => {
    const { component: oldComponent, events } = setup();
    fixture!.destroy();
    fixture = TestBed.createComponent(LogsComponent);
    const current = fixture.componentInstance;
    events.next(new NavigationEnd(1, '/about/logs', '/about/logs/live'));
    expect(oldComponent.currentUrl()).toBe('/about/logs/stored');
    expect(current.currentUrl()).toBe('/about/logs/live');
    fixture.destroy();
    expect(events.observed).toBe(false);
  });

  it('keeps enabling polling and forwarding the chosen log level', () => {
    const { component, state } = setup();
    component.updateLogLevel('Warning');
    expect(state.isPolling()).toBe(true);
    expect(state.updateLogLevel).toHaveBeenCalledExactlyOnceWith('Warning');
  });
});
