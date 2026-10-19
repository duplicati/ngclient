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
});
