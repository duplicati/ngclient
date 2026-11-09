import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { CrashLogState } from './crashlog.state';

describe('CrashLogState loading and retry', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const responses: Subject<{ Logdata?: string | null }>[] = [];
    const get = vi.fn(() => {
      const response = new Subject<{ Logdata?: string | null }>();
      responses.push(response);
      return response;
    });
    TestBed.configureTestingModule({
      providers: [CrashLogState, { provide: DuplicatiServer, useValue: { getApiV1LogdataCrashlog: get } }],
    });
    return { state: TestBed.inject(CrashLogState), responses, get };
  }
  it('shares an in-flight load instead of requesting it twice', () => {
    const { state, get, responses } = setup();
    state.load();
    state.load();
    expect(get).toHaveBeenCalledTimes(1);
    expect(state.isLoaded()).toBe(false);
    responses[0].next({ Logdata: 'stack trace' });
    responses[0].complete();
    expect(state.crashLog()).toBe('stack trace');
    expect(state.isLoaded()).toBe(true);
    state.load();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('allows a later visit to retry after a failed load', () => {
    const { state, get, responses } = setup();
    state.load();
    responses[0].error(new Error('network unavailable'));
    expect(state.isLoaded()).toBe(false);
    expect(state.crashLog()).toBeNull();
    state.load();
    expect(get).toHaveBeenCalledTimes(2);
    responses[1].next({ Logdata: 'recovered log' });
    responses[1].complete();
    expect(state.crashLog()).toBe('recovered log');
    expect(state.isLoaded()).toBe(true);
  });
  it('caches a successful empty log', () => {
    const { state, get, responses } = setup();
    state.load();
    responses[0].next({ Logdata: null });
    responses[0].complete();
    state.load();
    expect(state.crashLog()).toBeNull();
    expect(state.isLoaded()).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('releases the pending guard for synchronous successful loads', () => {
    const get = vi.fn(() => of({ Logdata: 'cached log' }));
    TestBed.configureTestingModule({
      providers: [CrashLogState, { provide: DuplicatiServer, useValue: { getApiV1LogdataCrashlog: get } }],
    });
    const state = TestBed.inject(CrashLogState);
    state.load();
    state.load();
    expect(state.crashLog()).toBe('cached log');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
