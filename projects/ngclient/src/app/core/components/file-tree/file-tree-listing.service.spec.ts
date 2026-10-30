import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { SysinfoState } from '../../states/sysinfo.state';
import { FileTreeListingContext, FileTreeListingService, RemoteSource } from './file-tree-listing.service';

describe('FileTreeListingService', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(api: object, backendV2 = true, restoreV2 = true) {
    TestBed.configureTestingModule({
      providers: [
        FileTreeListingService,
        { provide: DuplicatiServer, useValue: api },
        {
          provide: SysinfoState,
          useValue: { hasV2ListBackendOperations: () => backendV2, hasV2ListOperations: () => restoreV2 },
        },
      ],
    });
    return TestBed.inject(FileTreeListingService);
  }
  function context(overrides: Partial<FileTreeListingContext> = {}): FileTreeListingContext {
    return {
      showFiles: () => false,
      backupId: () => null,
      connectionStringId: () => null,
      destinationUrl: () => null,
      sourcePrefix: () => null,
      destinationType: () => 'Backend',
      backupSettings: () => null,
      customRemoteMode: () => null,
      loadExtendedData: () => true,
      isByBackupSettings: () => false,
      ...overrides,
    };
  }
  const remote = (type: string): RemoteSource => ({
    type,
    mount: '/mount/',
    prefix: '@/mount',
    url: type + '://source',
    path: '/remote/folder/',
  });
  const result = (request: ReturnType<FileTreeListingService['list']>) =>
    firstValueFrom(request as Observable<unknown>);

  it('does not start requests until subscribed and reads the current deferred input values', async () => {
    const list = vi.fn(() => of({ Data: { Items: [], HasMore: false } }));
    const service = setup({ postApiV2DestinationList: list });
    let id = 'before';
    let url = 'sftp://old';
    const request = service.list(
      '/folder/',
      null,
      context({ backupId: () => id, destinationUrl: () => url, customRemoteMode: () => 'backend' })
    );
    expect(list).not.toHaveBeenCalled();
    id = 'after';
    url = 'sftp://new';
    await result(request);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      body: {
        BackupId: 'after',
        DestinationUrl: 'sftp://new',
        ConnectionStringId: null,
        DestinationType: 'Backend',
        SourcePrefix: null,
        Path: '/folder/',
        Offset: null,
        Limit: 100,
      },
    });
  });

  it.each(['office365', 'googleworkspace', 'diskimage', 'smb'])(
    'uses the mounted %s source context and preserves raw pagination offsets',
    async (type) => {
      const list = vi.fn(() =>
        of({
          Data: {
            Items: [
              { Path: '/remote/folder/first.txt', Metadata: null },
              { Path: '/remote/folder/hidden/', Metadata: { ExtType: 'special' } },
            ],
            HasMore: true,
            Offset: 25,
          },
        })
      );
      const service = setup({ postApiV2DestinationList: list });
      expect(
        await result(
          service.list(
            '/ignored/',
            remote(type),
            context({
              backupId: () => '42',
              connectionStringId: () => 7,
              sourcePrefix: () => 'fallback-prefix',
              destinationUrl: () => 'fallback://url',
            }),
            20
          )
        )
      ).toEqual({
        items: [{ Path: '@/mount/remote/folder/first.txt', Metadata: null }],
        hasMore: true,
        nextOffset: 27,
      });
      expect(list).toHaveBeenCalledExactlyOnceWith({
        body: {
          BackupId: '42',
          DestinationUrl: type + '://source',
          ConnectionStringId: 7,
          DestinationType: 'SourceProvider',
          SourcePrefix: '@/mount',
          Path: '/remote/folder/',
          Offset: 20,
          Limit: 100,
        },
      });
    }
  );

  it.each([
    ['office365', 'office365'],
    ['googleworkspace', 'googleworkspace'],
  ] as const)('keeps the legacy %s source path, identifiers and metadata', async (type, modulekey) => {
    const list = vi.fn(() => of({ Status: 'OK', Result: { '/child/': '{"Name":"Friendly"}' } }));
    const service = setup({ postApiV1WebmoduleByModulekey: list }, false);
    expect(await result(service.list('/ignored/', remote(type), context({ backupId: () => '42' })))).toEqual([
      { Path: '@/mount/child/', Metadata: { Name: 'Friendly' } },
    ]);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      path: { modulekey },
      body: {
        'backup-id': '42',
        'source-prefix': '@/mount',
        operation: 'ListDestinationRestoreTargets',
        url: type + '://source',
        path: '/remote/folder/',
      },
    });
  });

  it('keeps the legacy disk-image response and does not add cloud-specific request fields', async () => {
    const list = vi.fn(() => of({ Result: { '/partition/': '{"diskimage:Type":"partition"}' } }));
    const service = setup({ postApiV1WebmoduleByModulekey: list }, false);
    expect(await result(service.list('/ignored/', remote('diskimage'), context()))).toEqual([
      { Path: '/partition/', Metadata: { 'diskimage:Type': 'partition' } },
    ]);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      path: { modulekey: 'diskimage' },
      body: {
        operation: 'ListDestinationRestoreTargets',
        path: '/remote/folder/',
      },
    });
  });

  it.each(['o365', 'gsuite'] as const)('propagates missing and failed legacy %s responses', async (mode) => {
    const list = vi
      .fn()
      .mockReturnValueOnce(of({ Status: 'OK' }))
      .mockReturnValueOnce(of({ Status: 'Error', Result: { error: 'denied' } }));
    const service = setup({ postApiV1WebmoduleByModulekey: list }, false);
    const ctx = context({ customRemoteMode: () => mode });
    await expect(result(service.list('/', null, ctx))).rejects.toThrow('No result returned');
    await expect(result(service.list('/', null, ctx))).rejects.toThrow('denied');
  });

  it.each([true, false])('preserves ReturnExtended=%s for a v2 restore request', async (extended) => {
    const list = vi.fn(() => of({ Data: [{ Path: '/file', Size: 12 }] }));
    const service = setup({ postApiV2BackupListFolder: list });
    const ctx = context({
      backupSettings: () => ({ id: '42', time: 'saved-time' }),
      isByBackupSettings: () => true,
      loadExtendedData: () => extended,
    });
    expect(await result(service.list('/', null, ctx))).toEqual([{ Path: '/file', Size: 12 }]);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      body: { BackupId: '42', Time: 'saved-time', Paths: ['/'], PageSize: 0, Page: 0, ReturnExtended: extended },
    });
  });

  it('keeps restore request identity captured before subscription', async () => {
    const list = vi.fn(() => of({ Files: [] }));
    const service = setup({ getApiV1BackupByIdFiles: list }, true, false);
    let settings = { id: '42', time: 'saved-time' };
    const request = service.list(
      '/folder/',
      null,
      context({ backupSettings: () => settings, isByBackupSettings: () => true })
    );
    settings = { id: 'other', time: 'later' };
    await result(request);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      path: { id: '42' },
      query: { 'prefix-only': false, 'folder-contents': true, time: 'saved-time', filter: '@/folder/' },
    });
  });

  it('preserves subscription teardown', async () => {
    const teardown = vi.fn();
    const service = setup({ postApiV1Filesystem: () => new Observable(() => teardown) });
    const subscription = service.list('/', null, context()).subscribe();
    subscription.unsubscribe();
    expect(teardown).toHaveBeenCalledOnce();
  });
});
