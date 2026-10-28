import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

describe('file tree listing contracts', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  function setup(api: object, inputs: Record<string, unknown> = {}, v2Backend = true, v2Restore = true) {
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        { provide: DuplicatiServer, useValue: api },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            filterGroups: signal({}),
            hasV2ListBackendOperations: () => v2Backend,
            hasV2ListOperations: () => v2Restore,
            hasV2FilterOperations: () => false,
            resolveShorthandPath: (path: string) => path,
          },
        },
        { provide: FileTreeState, useValue: { foldersFirst: signal(true), caseSensitiveSort: signal(false) } },
        { provide: ShipDialogService, useValue: {} },
      ],
    });
    TestBed.overrideComponent(FileTreeComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(FileTreeComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it.each([false, true])('preserves local listing flags with showFiles=%s', (showFiles) => {
    const list = vi.fn(() =>
      of([
        { id: '/documents/', text: 'Documents', cls: 'folder' },
        { id: '%HOME%', text: 'Home' },
      ])
    );
    const component = setup({ postApiV1Filesystem: list }, { showFiles, hideShortcuts: true });
    expect(list).toHaveBeenCalledExactlyOnceWith({
      query: { showHidden: true, onlyFolders: !showFiles },
      body: { path: '/' },
    });
    expect(component.treeNodes()).toEqual([expect.objectContaining({ id: '/documents/', parentPath: '/' })]);
    expect(component.isLoading()).toBeNull();
  });

  it('keeps backend request identifiers, filtering and pagination offsets', () => {
    const list = vi.fn(({ body }: { body: { Offset: number | null } }) =>
      of({
        Data:
          body.Offset === null
            ? {
                Items: [
                  { Path: '/folder/', Metadata: null },
                  { Path: '/hidden/', Metadata: { ExtType: 'special' } },
                ],
                Offset: 10,
                HasMore: true,
              }
            : { Items: [{ Path: '/second.txt', Metadata: null }], Offset: body.Offset, HasMore: false },
      })
    );
    const component = setup(
      { postApiV2DestinationList: list },
      {
        customRemoteMode: 'backend',
        backupId: '42',
        connectionStringId: 7,
        sourcePrefix: 'prefix',
        destinationUrl: 'sftp://example/archive',
        destinationType: 'Backend',
      }
    );
    expect(list).toHaveBeenNthCalledWith(1, {
      body: {
        BackupId: '42',
        ConnectionStringId: 7,
        SourcePrefix: 'prefix',
        DestinationUrl: 'sftp://example/archive',
        DestinationType: 'Backend',
        Path: '/',
        Offset: null,
        Limit: 100,
      },
    });
    expect(component.treeNodes().some((x) => x.id === '/hidden/')).toBe(false);
    const more = component.treeNodes().find((x) => x.isLoadMore)!;
    expect(more.loadMoreOffset).toBe(12);
    component.loadMore(new Event('click'), more as Parameters<typeof component.loadMore>[1]);
    expect(list).toHaveBeenLastCalledWith({
      body: {
        BackupId: '42',
        ConnectionStringId: 7,
        SourcePrefix: 'prefix',
        DestinationUrl: 'sftp://example/archive',
        DestinationType: 'Backend',
        Path: '/',
        Offset: 12,
        Limit: 100,
      },
    });
    expect(component.treeNodes().map((x) => x.id)).toEqual(['/folder/', '/second.txt']);
  });

  it.each([
    ['o365', 'office365'],
    ['gsuite', 'googleworkspace'],
    ['diskimage', 'diskimage'],
  ] as const)('retains the legacy %s request and metadata response', (mode, modulekey) => {
    const list = vi.fn(() =>
      of({ Status: 'OK', Result: { '/folder/': JSON.stringify({ 'o365:Name': 'Friendly name' }) } })
    );
    const component = setup(
      { postApiV1WebmoduleByModulekey: list },
      { customRemoteMode: mode, backupId: '42', destinationUrl: 'backend://example', sourcePrefix: 'source-prefix' },
      false
    );
    expect(list).toHaveBeenCalledExactlyOnceWith({
      path: { modulekey },
      body:
        mode === 'diskimage'
          ? {
              operation: 'ListDestinationRestoreTargets',
              path: '/',
            }
          : {
              'backup-id': '42',
              'source-prefix': 'source-prefix',
              operation: 'ListDestinationRestoreTargets',
              url: 'backend://example',
              path: '/',
            },
    });
    expect(component.treeNodes()).toContainEqual(
      expect.objectContaining({ id: '/folder/', text: 'Friendly name', cls: 'folder' })
    );
  });

  it.each(['o365', 'gsuite', 'diskimage'])('prefers v2 SourceProvider listing for %s', (mode) => {
    const list = vi.fn(() => of({ Data: { Items: [], HasMore: false } }));
    setup(
      { postApiV2DestinationList: list },
      {
        customRemoteMode: mode,
        backupId: '42',
        destinationUrl: 'backend://example',
        backupSettings: { id: 'restore-id', time: '2026-10-01T12:00:00Z' },
      }
    );
    expect(list).toHaveBeenCalledExactlyOnceWith({
      body: {
        BackupId: '42',
        DestinationUrl: 'backend://example',
        ConnectionStringId: null,
        DestinationType: 'SourceProvider',
        SourcePrefix: '',
        Path: '/',
        Offset: null,
        Limit: 100,
      },
    });
  });

  it('preserves the v1 restore request and folder response', () => {
    const list = vi.fn(() => of({ Files: [{ Path: '/root/file.txt', Size: 12, Metadata: null }] }));
    const component = setup(
      { getApiV1BackupByIdFiles: list },
      { backupSettings: { id: '42', time: 'saved-time' }, rootPaths: ['/root/'] },
      true,
      false
    );
    expect(list).toHaveBeenCalledExactlyOnceWith({
      path: { id: '42' },
      query: {
        'prefix-only': false,
        'folder-contents': true,
        time: 'saved-time',
        filter: '@/root/',
      },
    });
    expect(component.treeNodes()).toContainEqual(
      expect.objectContaining({ id: '/root/file.txt', fileSize: 12, parentPath: '/root/' })
    );
  });

  it('keeps loading active until a request fails, then exposes the error', () => {
    const response = new Subject<never>();
    const component = setup({ postApiV1Filesystem: () => response });
    expect(component.isLoading()).toBe('/');
    response.error(new Error('offline'));
    expect(component.isLoading()).toBeNull();
    expect(component.errorMessage()).toBe('offline');
    expect(component.treeNodes()).toEqual([]);
  });

  it('retains successful ancestor listings if another starting-path segment fails', () => {
    const list = vi.fn(({ body }: { body: { path: string } }) =>
      body.path === '/root/sub/'
        ? throwError(() => new Error('missing subfolder'))
        : of([{ id: body.path, text: body.path, cls: 'folder' }])
    );
    const component = setup({ postApiV1Filesystem: list }, { startingPath: '/root/sub/file.txt' });
    expect(list.mock.calls.map((x) => x[0].body.path)).toEqual(['/', '/root/', '/root/sub/']);
    expect(component.treeNodes().map((x) => x.id)).toEqual(['/', '/root/']);
    expect(component.isLoading()).toBeNull();
  });
});
