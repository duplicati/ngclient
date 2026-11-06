import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, ListFilesetsResponseItem } from '../../core/openapi';
import { PurgeFilesState } from './purge-files.state';

describe('PurgeFilesState version selection', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const response = new Subject<{ Data?: ListFilesetsResponseItem[] }>();
    const responses = [response];
    let calls = 0;
    const list = vi.fn(() => {
      if (calls++ === 0) return response;
      const next = new Subject<{ Data?: ListFilesetsResponseItem[] }>();
      responses.push(next);
      return next;
    });
    TestBed.configureTestingModule({
      providers: [PurgeFilesState, { provide: DuplicatiServer, useValue: { postApiV2BackupListFilesets: list } }],
    });
    return { state: TestBed.inject(PurgeFilesState), response, responses, list };
  }
  const version = (Version: number, Time: string): ListFilesetsResponseItem => ({
    Version,
    Time,
    IsFullBackup: null,
    FileCount: null,
    FileSizes: null,
  });
  it('clears destructive selections and versions when the backup changes', () => {
    const { state, response } = setup();
    state.init('42');
    response.next({ Data: [version(4, '2026-10-09')] });
    state.selectedPaths.set('/backup-a/private.txt');
    state.versionScope.set('specific');
    state.specificVersions.set([4]);
    state.init('43');
    expect(state.versions()).toEqual([]);
    expect(state.selectedVersion()).toBeNull();
    expect(state.selectedPaths()).toBe('');
    expect(state.versionScope()).toBe('all');
    expect(state.specificVersions()).toEqual([]);
    expect(state.isLoadingVersions()).toBe(true);
  });
  it('ignores an old backup response while the new backup is loading', () => {
    const { state, response, responses } = setup();
    state.init('42');
    state.init('43');
    response.next({ Data: [version(4, '2026-10-09')] });
    response.complete();
    expect(state.versions()).toEqual([]);
    expect(state.selectedVersion()).toBeNull();
    expect(state.isLoadingVersions()).toBe(true);
    responses[1].next({ Data: [version(0, '2026-11-07')] });
    responses[1].complete();
    expect(state.selectedVersion()).toBe('0');
    expect(state.versions()[0].Time).toBe('2026-11-07');
  });
  it('stops observing versions when the flow is destroyed', () => {
    const { state, response } = setup();
    state.init('42');
    TestBed.resetTestingModule();
    response.next({ Data: [version(4, '2026-10-09')] });
    response.complete();
    expect(state.versions()).toEqual([]);
    expect(state.selectedVersion()).toBeNull();
    expect(state.isLoadingVersions()).toBe(false);
  });

  it('requests versions once per backup and waits for the response', () => {
    const { state, response, list } = setup();
    state.init('42');
    state.init('42');
    expect(list).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: '42' } });
    expect(state.isLoadingVersions()).toBe(true);
    response.next({ Data: [] });
    expect(state.isLoadingVersions()).toBe(false);
    expect(state.selectedVersion()).toBeNull();
    state.init('43');
    expect(list).toHaveBeenLastCalledWith({ body: { BackupId: '43' } });
  });
  it('sorts a copy by time and selects version zero rather than the first item', () => {
    const { state, response } = setup();
    const data = [version(0, '2026-10-09'), version(4, '2026-10-11'), version(9, '2026-10-10')];
    state.init('42');
    response.next({ Data: data });
    expect(state.versions().map((x) => x.Version)).toEqual([4, 9, 0]);
    expect(data.map((x) => x.Version)).toEqual([0, 4, 9]);
    expect(state.selectedVersion()).toBe('0');
    expect(state.selectedVersionItem()).toEqual(data[0]);
  });
  it('falls back to the newest returned version when version zero is absent', () => {
    const { state, response } = setup();
    state.init('42');
    response.next({ Data: [version(3, '2026-10-09'), version(7, '2026-10-11')] });
    expect(state.selectedVersion()).toBe('7');
  });
  it('preserves an explicit selection and resolves missing versions to null', () => {
    const { state, response } = setup();
    state.selectedVersion.set('4');
    state.init('42');
    response.next({ Data: [version(0, '2026-10-11'), version(4, '2026-10-09')] });
    expect(state.selectedVersion()).toBe('4');
    expect(state.selectedVersionItem()?.Version).toBe(4);
    state.selectedVersion.set('99');
    expect(state.selectedVersionItem()).toBeNull();
  });
  it('finishes loading on a request failure', () => {
    const { state, response } = setup();
    state.init('42');
    response.error(new Error('unavailable'));
    expect(state.isLoadingVersions()).toBe(false);
    expect(state.versions()).toEqual([]);
    expect(state.selectedVersion()).toBeNull();
  });
  it('drops blank path entries without trimming meaningful path whitespace', () => {
    const { state } = setup();
    state.selectedPaths.set('/data/a\0 \0\0/data/with space \0C:\\data\\');
    expect(state.selectedPathsArray()).toEqual(['/data/a', '/data/with space ', 'C:\\data\\']);
  });
});
