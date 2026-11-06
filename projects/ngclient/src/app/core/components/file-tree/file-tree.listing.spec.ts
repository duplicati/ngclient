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

  it('keeps the last-modified time from the v2 restore listing and hides placeholder dates', () => {
    const list = vi.fn(() =>
      of({
        Data: [
          { Path: '/root/file.txt', Size: 12, LastModified: '2026-10-01T12:00:00Z', Metadata: null },
          { Path: '/root/unknown.txt', Size: 1, LastModified: '0001-01-01T00:00:00', Metadata: null },
          { Path: '/root/epoch.txt', Size: 1, LastModified: '1970-01-01T00:00:00Z', Metadata: null },
          { Path: '/root/missing.txt', Size: 1, Metadata: null },
        ],
      })
    );
    const component = setup(
      { postApiV2BackupListFolder: list },
      { backupSettings: { id: '42', time: 'saved-time' }, rootPaths: ['/root/'] }
    );
    const nodes = component.treeStructure()[0].children;
    const byId = (id: string) => nodes.find((node) => node.id === id)!;
    expect(byId('/root/file.txt')).toEqual(expect.objectContaining({ lastModified: '2026-10-01T12:00:00Z' }));
    expect(component.treeNodeLastModified(byId('/root/file.txt'))).toBe('2026-10-01T12:00:00Z');
    expect(component.treeNodeLastModifiedTitle('2026-10-01T12:00:00Z')).toMatch(/^Last modified: .+2026.+/);
    expect(component.treeNodeLastModified(byId('/root/unknown.txt'))).toBeNull();
    expect(component.treeNodeLastModified(byId('/root/epoch.txt'))).toBeNull();
    expect(component.treeNodeLastModified(byId('/root/missing.txt'))).toBeNull();
  });

  it('marks symbolic links from the v2 restore listing and announces them in the row label', () => {
    const list = vi.fn(() =>
      of({
        Data: [
          { Path: '/root/link/', Size: 0, IsSymlink: true, Metadata: null },
          { Path: '/root/plain.txt', Size: 1, IsSymlink: false, Metadata: null },
          { Path: '/root/legacy.txt', Size: 1, Metadata: null },
        ],
      })
    );
    const component = setup(
      { postApiV2BackupListFolder: list },
      { backupSettings: { id: '42', time: 'saved-time' }, rootPaths: ['/root/'] }
    );
    const nodes = component.treeStructure()[0].children;
    const byId = (id: string) => nodes.find((node) => node.id === id)!;
    expect(byId('/root/link/').symlink).toBe(true);
    expect(byId('/root/plain.txt').symlink).toBe(false);
    expect(byId('/root/legacy.txt').symlink).toBe(false);
    expect(component.treeItemLabel(byId('/root/link/'))).toBe('link (Symbolic link)');
    expect(component.treeItemLabel(byId('/root/plain.txt'))).toBe('plain.txt');
    expect(component.treeNodeBadge(byId('/root/link/'))?.icon).toBe('arrow-bend-up-right');
    expect(component.treeNodeBadge(byId('/root/plain.txt'))).toBeNull();
    expect(component.treeNodeBadge({ id: '%HOME%', symlink: false } as any)?.icon).toBe('user');
  });

  it('picks a badge from the node kind, falling back to the kind family', () => {
    const component = setup({ postApiV1Filesystem: () => of([]), postApiV2FilesystemList: () => of({ Data: [] }) });
    const badge = (kind: string | null, extra: object = {}) =>
      component.treeNodeBadge({ id: '/x/', symlink: false, kind, ...extra } as any);

    expect(badge('locked')?.icon).toBe('lock');
    expect(badge('drive')?.icon).toBe('hard-drive');
    expect(badge('drive:network')?.icon).toBe('globe-simple');
    expect(badge('special:my_documents')?.icon).toBe('file-text');
    expect(badge('special:unknown')?.icon).toBe('star');
    expect(badge('qnap:share')?.icon).toBe('share-network');
    expect(badge('hyperv:root')?.icon).toBe('cube');
    expect(badge('hyperv:virtualmachine')?.icon).toBe('monitor');
    expect(badge('mssql:instance')?.icon).toBe('stack');
    expect(badge('mssql:database')?.icon).toBe('database');
    // Leaf entries that stand for a VM or database take the icon instead of a file icon
    expect(badge('hyperv:virtualmachine')?.replacesIcon).toBe(true);
    expect(badge('mssql:database')?.replacesIcon).toBe(true);
    expect(badge('mssql:instance')?.replacesIcon).toBeFalsy();
    expect(badge('special:home')?.replacesIcon).toBeFalsy();
    expect(badge('unknown-kind')).toBeNull();
    expect(badge(null)).toBeNull();
    // A symlink keeps its arrow even when the server also sends a kind
    expect(badge('locked', { symlink: true })?.icon).toBe('arrow-bend-up-right');

    expect(component.treeItemLabel({ id: '/x/', text: 'secret', kind: 'locked' } as any)).toBe(
      'secret (Access denied)'
    );
    expect(component.treeItemLabel({ id: '%HOME%', text: 'Home', kind: 'special:home' } as any)).toBe('Home');
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
