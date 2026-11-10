import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, SearchEntriesResponseDto } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import SelectFilesComponent, { createRestoreSelectFilesForm } from './select-files.component';

const emptyResponse: SearchEntriesResponseDto = {
  Success: true,
  Error: null,
  StatusCode: null,
  Data: [],
  PageInfo: {},
};

describe('restore search request and results', () => {
  let fixture: ComponentFixture<SelectFilesComponent>;
  afterEach(() => {
    fixture?.componentInstance.abortLoading();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  function setup() {
    const form = createRestoreSelectFilesForm();
    const response = new Subject<SearchEntriesResponseDto>();
    const search = vi.fn(() => response.asObservable());
    const flow = {
      selectFilesForm: form,
      selectFilesFormSignal: signal(form.getRawValue()),
      selectOption: signal<string | null>('0'),
      backupId: signal('42'),
      versionOptionsLoading: signal(true),
      waitingForBackup: signal(false),
      versionOptions: signal([
        { Version: 0, Time: '2026-10-01T12:00:00Z' },
        { Version: 7, Time: '2026-09-24T12:00:00Z' },
      ]),
      isFileRestore: signal(false),
      extendedDataType: signal<string | null>(null),
      backup: signal({ Backup: { IsTemporary: false } }),
    };
    TestBed.configureTestingModule({
      imports: [SelectFilesComponent],
      providers: [
        { provide: RestoreFlowState, useValue: flow },
        {
          provide: DuplicatiServer,
          useValue: { postApiV2BackupListFolder: () => of({ Data: [] }), postApiV2BackupSearch: search },
        },
        { provide: ServerStateService, useValue: {} },
        { provide: ShipDialogService, useValue: {} },
        { provide: SysinfoState, useValue: { hasV2ListOperations: () => true } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    TestBed.overrideComponent(SelectFilesComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(SelectFilesComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, flow, search, response };
  }

  it('searches all versions without a version or time restriction', () => {
    const { component, search } = setup();
    component.searchAllVersions.set(true);
    component.searchQuery.set('*report*');
    component.performSearch();
    expect(search).toHaveBeenCalledWith({
      body: expect.objectContaining({ Version: null, Time: null, PageSize: 100 }),
    });
  });

  it.each(['0', '7'])('searches only selected version %s with a trimmed filter', (version) => {
    const { component, flow, search } = setup();
    flow.selectOption.set(version);
    component.searchQuery.set('  *report*.pdf  ');
    component.performSearch();
    expect(search).toHaveBeenCalledExactlyOnceWith({
      body: {
        BackupId: '42',
        Time: null,
        Version: [Number(version)],
        Filters: ['*report*.pdf'],
        Paths: null,
        PageSize: 1000,
        Page: 0,
        ReturnExtended: false,
        SearchMetadata: false,
      },
    });
    expect(component.isSearching()).toBe(true);
    expect(component.hasSearched()).toBe(true);
  });

  it.each(['extended', 'virtual'] as const)('requests metadata for %s sources', (kind) => {
    const { component, flow, search } = setup();
    if (kind === 'extended') flow.extendedDataType.set('hyperv');
    else component.hasVirtualSources.set(true);
    component.searchQuery.set('*report*');
    component.performSearch();
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ ReturnExtended: true, SearchMetadata: true }) })
    );
  });

  it.each(['blank', 'no backup', 'unknown version'] as const)('does not search with %s input', (kind) => {
    const { component, flow, search } = setup();
    component.searchQuery.set(kind === 'blank' ? '  ' : '*report*');
    if (kind === 'no backup') component.backupSettings.set(null);
    if (kind === 'unknown version') flow.selectOption.set('99');
    component.performSearch();
    expect(search).not.toHaveBeenCalled();
    expect(component.isSearching()).toBe(false);
  });

  it('loads results and parent metadata, then clears both when leaving search', () => {
    const { component, response } = setup();
    component.searchQuery.set('*report*');
    component.performSearch();
    const data = [
      {
        Version: 0,
        Time: '2026-10-01T12:00:00Z',
        Path: '/documents/report.pdf',
        Size: 123,
        IsDirectory: false,
        IsSymlink: false,
        LastModified: '2026-10-01T11:00:00Z',
        Metadata: null,
      },
    ];
    const metadata = { '/documents/': { 'display-name': 'Documents' } };
    response.next({ ...emptyResponse, Data: data, ParentMetadata: metadata });
    response.complete();
    expect(component.searchResults()).toEqual(data);
    expect(component.searchParentMetadata()).toEqual(metadata);
    expect(component.isSearching()).toBe(false);
    expect(component.isSearchMode()).toBe(true);
    component.clearSearch();
    expect(component.searchQuery()).toBe('');
    expect(component.searchResults()).toEqual([]);
    expect(component.searchParentMetadata()).toEqual({});
    expect(component.hasSearched()).toBe(false);
    expect(component.isSearchMode()).toBe(false);
  });

  it('accepts results from older servers that omit parent metadata', () => {
    const { component, response } = setup();
    component.searchQuery.set('*report*');
    component.performSearch();
    response.next(emptyResponse);
    response.complete();
    expect(component.searchParentMetadata()).toEqual({});
    expect(component.searchResults()).toEqual([]);
    expect(component.isSearching()).toBe(false);
  });

  it('ends the pending state on failure and permits a retry', () => {
    const { component, search, response } = setup();
    component.searchQuery.set('*report*');
    component.performSearch();
    response.error(new Error('Offline'));
    expect(component.isSearching()).toBe(false);
    expect(component.searchResults()).toEqual([]);
    search.mockReturnValue(of(emptyResponse));
    component.performSearch();
    expect(search).toHaveBeenCalledTimes(2);
    expect(component.isSearching()).toBe(false);
  });
  function hit(version = 7, time = '2026-09-24T12:00:00Z') {
    return {
      Version: version,
      Time: time,
      Path: '/documents/report.pdf',
      Size: 123,
      IsDirectory: false,
      IsSymlink: false,
      LastModified: time,
      Metadata: null,
    };
  }

  it('keeps duplicate paths in different versions and selects by timestamp when version numbers shift', () => {
    const { component, flow, response } = setup();
    component.searchAllVersions.set(true);
    component.searchQuery.set('*report*');
    flow.selectFilesForm.controls.filesToRestore.setValue('/old/selection');
    component.performSearch();
    const older = hit(8); // A new backup changed the server's relative version numbers.
    response.next({ ...emptyResponse, Data: [hit(1, '2026-10-01T12:00:00Z'), older] });
    response.complete();
    expect(component.searchResults()).toHaveLength(2);
    component.selectSearchResult(older);
    expect(flow.selectOption()).toBe('7');
    expect(flow.selectFilesForm.controls.filesToRestore.value).toBe('/documents/report.pdf');
    expect(component.allVersionResults()).toBe(false);
    expect(component.searchResults()).toEqual([]);
  });

  it('refuses to substitute another version when a hit timestamp is unavailable', () => {
    const { component, flow, response } = setup();
    component.searchAllVersions.set(true);
    component.searchQuery.set('*report*');
    component.performSearch();
    const missing = hit(0, '2020-01-01T00:00:00Z');
    response.next({ ...emptyResponse, Data: [missing] });
    response.complete();
    component.selectSearchResult(missing);
    expect(component.unavailableVersion()).toBe(true);
    expect(flow.selectOption()).toBe('0');
    expect(flow.selectFilesForm.controls.filesToRestore.value).toBe('');
    expect(component.allVersionResults()).toBe(true);
  });

  it('loads another page with the same all-version query', () => {
    const { component, search, response } = setup();
    component.searchAllVersions.set(true);
    component.searchQuery.set('*report*');
    component.performSearch();
    response.next({ ...emptyResponse, PageInfo: { Page: 0, Pages: 3 } });
    response.complete();
    expect(component.searchPages()).toBe(3);
    search.mockReturnValue(of({ ...emptyResponse, Data: [hit()], PageInfo: { Page: 1, Pages: 0 } }));
    component.performSearch(1);
    expect(search).toHaveBeenLastCalledWith({
      body: expect.objectContaining({ Version: null, Filters: ['*report*'], Page: 1, PageSize: 100 }),
    });
    expect(component.searchPage()).toBe(1);
    expect(component.searchPages()).toBe(3);
    expect(component.searchResults()).toHaveLength(1);
  });

  it.each(['query', 'scope', 'version', 'backup', 'clear', 'destroy'] as const)(
    'cancels pending search on %s changes',
    (change) => {
      const { component, flow, response } = setup();
      component.searchAllVersions.set(true);
      component.searchQuery.set('*report*');
      component.performSearch();
      if (change === 'query') component.searchQuery.set('*other*');
      if (change === 'scope') component.searchAllVersions.set(false);
      if (change === 'version') flow.selectOption.set('7');
      if (change === 'backup') flow.backupId.set('43');
      if (change === 'clear') component.clearSearch();
      if (change === 'destroy') fixture.destroy();
      else fixture.detectChanges();
      expect(response.observed).toBe(false);
      expect(component.isSearching()).toBe(false);
      response.next({ ...emptyResponse, Data: [hit()] });
      expect(component.searchResults()).toEqual([]);
    }
  );

  it('ignores stale results even before change detection processes a query change', () => {
    const { component, flow, response } = setup();
    component.searchAllVersions.set(true);
    component.searchQuery.set('*report*');
    component.performSearch();
    const result = hit();
    response.next({ ...emptyResponse, Data: [result] });
    response.complete();
    component.searchQuery.set('*different*');
    component.selectSearchResult(result);
    expect(flow.selectOption()).toBe('0');
    expect(flow.selectFilesForm.controls.filesToRestore.value).toBe('');
  });

  it('reports unsuccessful responses and permits a retry', () => {
    const { component, search, response } = setup();
    component.searchAllVersions.set(true);
    component.searchQuery.set('*report*');
    component.performSearch();
    response.next({ ...emptyResponse, Success: false, Error: 'Database locked' });
    response.complete();
    expect(component.searchError()).toBe(true);
    search.mockReturnValue(of(emptyResponse));
    component.performSearch();
    expect(component.searchError()).toBe(false);
  });
});
