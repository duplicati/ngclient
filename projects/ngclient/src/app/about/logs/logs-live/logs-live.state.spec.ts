import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, LogEntry } from '../../../core/openapi';
import { LogsLiveState } from './logs-live.state';

describe('live log cursor, accumulation and polling', () => {
  let state: LogsLiveState | undefined;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    state?.destroy();
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
    state = undefined;
  });
  function setup() {
    const responses: Subject<LogEntry[]>[] = [];
    const poll = vi.fn(() => {
      const response = new Subject<LogEntry[]>();
      responses.push(response);
      return response;
    });
    TestBed.configureTestingModule({
      providers: [LogsLiveState, { provide: DuplicatiServer, useValue: { getApiV1LogdataPoll: poll } }],
    });
    state = TestBed.inject(LogsLiveState);
    TestBed.tick();
    state.updateLogLevel('Information');
    return { state, poll, responses };
  }
  const row = (ID: number, BackupID = '42', When = '2026-10-24T00:00:00Z') =>
    ({ ID, BackupID, When, Message: 'Log ' + ID }) as LogEntry;
  it('requests the configured level and page size, then records the highest ID and newest-first order', () => {
    const { state, poll, responses } = setup();
    state.updateLogLevel('Warning');
    state.pagination.set({ offset: 0, pagesize: 25 });
    state.loadLogs();
    expect(poll).toHaveBeenCalledExactlyOnceWith({ query: { id: 0, level: 'Warning', pagesize: 25 } });
    expect(state.logsLoading()).toBe(true);
    responses[0].next([row(2), row(7)]);
    responses[0].complete();
    expect(state.id()).toBe(7);
    expect(state.logs().map((x) => x.ID)).toEqual([7, 2]);
    expect(state.logsLoading()).toBe(false);
  });
  it('uses the prior cursor and prepends later batches without dropping older rows', () => {
    const { state, poll, responses } = setup();
    state.loadLogs();
    responses[0].next([row(2), row(7)]);
    responses[0].complete();
    state.loadLogs();
    expect(poll).toHaveBeenLastCalledWith({ query: { id: 7, level: 'Information', pagesize: 100 } });
    responses[1].next([row(8), row(10)]);
    responses[1].complete();
    expect(state.id()).toBe(10);
    expect(state.logs().map((x) => x.ID)).toEqual([10, 8, 7, 2]);
  });
  it('keeps the current cursor and visible rows on an empty response', () => {
    const { state, responses } = setup();
    state.loadLogs();
    responses[0].next([row(7)]);
    responses[0].complete();
    state.loadLogs();
    responses[1].next([]);
    responses[1].complete();
    expect(state.id()).toBe(7);
    expect(state.logs().map((x) => x.ID)).toEqual([7]);
    expect(state.logsLoading()).toBe(false);
  });
  it('limits task-scoped logs to the selected job and inclusive start time', () => {
    const { state, responses } = setup();
    state.loadLogs();
    responses[0].next([row(1, '42', '2026-10-23T23:59:59Z'), row(2), row(3, 'other')]);
    responses[0].complete();
    state.setWhenFilter(Date.parse('2026-10-24T00:00:00Z'));
    state.setBackupIdFilter('42');
    expect(state.logs().map((x) => x.ID)).toEqual([2]);
    state.setWhenFilter(null);
    state.setBackupIdFilter(null);
    expect(state.logs()).toHaveLength(3);
  });
  it('starts one immediate poll, uses the latest level on the interval and stops when disabled', async () => {
    const { state, poll, responses } = setup();
    state.updateLogLevel('Warning');
    state.isPolling.set(true);
    TestBed.tick();
    await Promise.resolve();
    expect(poll).toHaveBeenCalledTimes(1);
    responses[0].next([row(7)]);
    responses[0].complete();
    state.updateLogLevel('Error');
    vi.advanceTimersByTime(3000);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll).toHaveBeenLastCalledWith({ query: { id: 7, level: 'Error', pagesize: 100 } });
    responses[1].next([]);
    responses[1].complete();
    state.updateLogLevel('Disabled');
    vi.advanceTimersByTime(9000);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(state.timerInterval).toBeUndefined();
  });
  it('clears the interval on destruction so an abandoned view cannot keep polling', async () => {
    const { state, poll, responses } = setup();
    state.updateLogLevel('Verbose');
    state.isPolling.set(true);
    TestBed.tick();
    await Promise.resolve();
    responses[0].next([]);
    responses[0].complete();
    state.destroy();
    vi.advanceTimersByTime(12000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(state.logLevel()).toBe('Disabled');
    expect(state.timerInterval).toBeUndefined();
  });
});
