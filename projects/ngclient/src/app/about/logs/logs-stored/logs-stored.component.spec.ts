import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import LogsStoredComponent from './logs-stored.component';

vi.mock('@ship-ui/core/ship-table', () => ({ ShipTable: [] }));

describe('stored server log pagination', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const responses: Subject<unknown[]>[] = [];
    const get = vi.fn(() => {
      const response = new Subject<unknown[]>();
      responses.push(response);
      return response;
    });
    TestBed.configureTestingModule({
      imports: [LogsStoredComponent],
      providers: [{ provide: DuplicatiServer, useValue: { getApiV1LogdataLog: get } }],
    });
    TestBed.overrideComponent(LogsStoredComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(LogsStoredComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, get, responses };
  }
  const first = { BackupID: 1, Timestamp: 100, Message: 'First', Exception: '' };
  const second = { BackupID: 2, Timestamp: 90, Message: 'Second', Exception: '' };

  it('requests the first page exactly once on initial display', () => {
    const { get, component, responses } = setup();
    expect(get).toHaveBeenCalledExactlyOnceWith({ query: { pagesize: 10, offset: undefined } });
    expect(component.logsIsLoading()).toBe(true);
    responses[0].next([first]);
    responses[0].complete();
    expect(component.logs()).toEqual([first]);
    expect(component.logsIsLoading()).toBe(false);
  });

  it('loads the next page using the last timestamp without replacing previous rows', () => {
    const { fixture, component, get, responses } = setup();
    responses[0].next([first]);
    responses[0].complete();
    component.loadMore();
    fixture.detectChanges();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith({ query: { pagesize: 10, offset: 100 } });
    responses[1].next([second]);
    responses[1].complete();
    expect(component.logs()).toEqual([first, second]);
    expect(component.logsIsLoading()).toBe(false);
  });

  it('marks the end on an empty page and retains the displayed rows', () => {
    const { fixture, component, responses } = setup();
    responses[0].next([first]);
    responses[0].complete();
    component.loadMore();
    fixture.detectChanges();
    responses[1].next([]);
    responses[1].complete();
    expect(component.noMoreItems()).toBe(true);
    expect(component.logs()).toEqual([first]);
    expect(component.logsIsLoading()).toBe(false);
  });
});
