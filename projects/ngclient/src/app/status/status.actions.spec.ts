import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { config, ObservableInput, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { DuplicatiServer } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { BackupsState } from '../core/states/backups.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import StatusComponent from './status.component';
import { StatusPageState } from './status.state';

// Match the stored-log tests: the action tests do not render the live-log table.
vi.mock('@ship-ui/core/ship-table', () => ({ ShipTable: [] }));

describe('StatusComponent task action lifecycle', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const progress = signal<{ TaskID: number } | null>({ TaskID: 73 });
    const responses = { stop: [] as Subject<unknown>[], abort: [] as Subject<unknown>[] };
    const operation = (action: 'stop' | 'abort') =>
      vi.fn((): ObservableInput<unknown> => {
        const response = new Subject<unknown>();
        responses[action].push(response);
        return response;
      });
    const stop = operation('stop');
    const abort = operation('abort');
    TestBed.configureTestingModule({
      imports: [StatusComponent],
      providers: [
        {
          provide: StatusBarState,
          useValue: { statusData: signal(null), serverState: signal(null), clientIsRunning: signal(true) },
        },
        { provide: StatusPageState, useValue: { progress, activateView: vi.fn(), deactivateView: vi.fn() } },
        { provide: BackupsState, useValue: {} },
        { provide: DuplicatiServer, useValue: { postApiV1TaskByTaskidStop: stop, postApiV1TaskByTaskidAbort: abort } },
        { provide: BytesPipe, useValue: { transform: String } },
        { provide: ServerSettingsService, useValue: { refreshServerSettings: vi.fn() } },
      ],
    }).overrideComponent(StatusComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(StatusComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, progress, stop, abort, responses };
  }

  it('does not send actions without a task', () => {
    const { component, progress, stop, abort } = setup();
    progress.set(null);
    component.stop();
    component.abort();
    expect(stop).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();
  });

  it.each(['stop', 'abort'] as const)('sends one pending %s request per task', (action) => {
    const context = setup();
    context.component[action]();
    context.component[action]();
    expect(context[action]).toHaveBeenCalledExactlyOnceWith({ path: { taskid: 73 } });
  });

  it('allows abort while graceful stop is pending, but not another stop during abort', () => {
    const { component, stop, abort } = setup();
    component.stop();
    component.abort();
    component.stop();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('keeps pending requests separate when the current task changes', () => {
    const { component, progress, stop, responses } = setup();
    component.stop();
    progress.set({ TaskID: 74 });
    component.stop();
    expect(stop).toHaveBeenLastCalledWith({ path: { taskid: 74 } });
    responses.stop[0].complete();
    component.stop();
    expect(stop).toHaveBeenCalledTimes(2);
    progress.set({ TaskID: 73 });
    component.stop();
    expect(stop).toHaveBeenCalledTimes(3);
  });

  it.each(['stop', 'abort'] as const)(
    'releases the %s subscription on destruction and rejects later calls',
    (action) => {
      const context = setup();
      context.component[action]();
      expect(context.responses[action][0].observed).toBe(true);
      context.fixture.destroy();
      expect(context.responses[action][0].observed).toBe(false);
      context.responses[action][0].error(new Error('late failure'));
      context.component[action]();
      expect(context[action]).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['stop', 'abort'] as const)('allows retry after %s fails without an unhandled error', async (action) => {
    const context = setup();
    const previous = config.onUnhandledError;
    const unhandled = vi.fn();
    config.onUnhandledError = unhandled;
    try {
      context[action].mockReturnValueOnce(throwError(() => new Error('operation failed')));
      context.component[action]();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      context.component[action]();
      expect(context[action]).toHaveBeenCalledTimes(2);
    } finally {
      config.onUnhandledError = previous;
    }
  });

  it.each(['stop', 'abort'] as const)('releases the pending %s guard after synchronous success', (action) => {
    const context = setup();
    context[action].mockReturnValue(of({}));
    context.component[action]();
    context.component[action]();
    expect(context[action]).toHaveBeenCalledTimes(2);
  });
});
