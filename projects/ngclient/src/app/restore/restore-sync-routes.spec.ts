import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { defer, of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../app.routes';
import { DuplicatiServer, SystemInfoDto } from '../core/openapi';
import { SysinfoState } from '../core/states/sysinfo.state';

function findRoute(path: string, config = routes): Route {
  for (const route of config) {
    if (route.path === path) return route;
    if (route.children) {
      try {
        return findRoute(path, route.children);
      } catch {}
    }
  }
  throw new Error('Missing route: ' + path);
}
@Component({ template: '<router-outlet />', imports: [RouterOutlet] })
class PageStub {}
@Component({ template: 'file listing' })
class FileListStub {
  constructor() {
    const server = inject(DuplicatiServer);
    defer(() => server.postApiV2BackupListFilesets({ body: { BackupId: '42' } })).subscribe();
  }
}
@Component({ template: 'Job operation' })
class JobOperationStub {}
@Component({ template: 'Restore selection' })
class RestoreSelectionStub {}

// Pages that need a backup database; a Sync job has none
const blocked = [
  'backup/:id/delete-versions',
  'backup/:id/purge-files',
  'backup/:id/version-labels',
  'backup/:id/broken-files',
];
// Pages that start by listing the versions
const fileListRoutes = [...blocked, 'restore/:id', 'restore-draft/:id'];
describe('Sync jobs restore through the restore flow but cannot enter version-management routes', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(path: string, OperationType: string | undefined = 'Sync', syncRestore = true) {
    const metadata = new Subject<{ Backup: { OperationType?: string } }>();
    const getBackup = vi.fn(() => metadata);
    const listFilesets = vi.fn(() => of({ Data: [] }));
    const actual = findRoute(path);
    const testRoute: Route = {
      path,
      canActivate: actual.canActivate,
      runGuardsAndResolvers: actual.runGuardsAndResolvers,
      component: PageStub,
      children: [{ path: '**', component: fileListRoutes.includes(path) ? FileListStub : JobOperationStub }],
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'restore', pathMatch: 'full', component: RestoreSelectionStub }, testRoute]),
        {
          provide: DuplicatiServer,
          useValue: { getApiV1BackupById: getBackup, postApiV2BackupListFilesets: listFilesets },
        },
      ],
    });
    TestBed.inject(SysinfoState).systemInfo.set({
      APIExtensions: syncRestore ? ['v1:backup:sync-restore'] : [],
    } as SystemInfoDto);
    const harness = await RouterTestingHarness.create();
    return { harness, getBackup, listFilesets, metadata, OperationType };
  }
  it.each(blocked)('redirects Sync away from %s before listing files', async (path) => {
    const { harness, getBackup, listFilesets, metadata } = await setup(path);
    const url = '/' + path.replace(':id', '42') + '/select-files';
    const navigation = harness.navigateByUrl(url);
    // Let guards start before providing the metadata response.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    metadata.next({ Backup: { OperationType: 'Sync' } });
    metadata.complete();
    await navigation;
    expect(getBackup).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' } });
    expect(TestBed.inject(Router).url).toBe('/restore');
    expect(listFilesets).not.toHaveBeenCalled();
  });
  it.each(['restore/:id', 'restore-draft/:id'])(
    'lets every job, Sync included, reach the file list of %s',
    async (path) => {
      const { harness, getBackup, listFilesets } = await setup(path);
      const url = '/' + path.replace(':id', '42') + '/select-files';
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe(url);
      expect(getBackup).not.toHaveBeenCalled();
      expect(listFilesets).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['restore/:id', 'restore-draft/:id'])(
    'sends a Sync job back to the restore page of %s on a server that cannot restore it',
    async (path) => {
      const { harness, getBackup, listFilesets, metadata } = await setup(path, 'Sync', false);
      const navigation = harness.navigateByUrl('/' + path.replace(':id', '42') + '/select-files');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      metadata.next({ Backup: { OperationType: 'Sync' } });
      metadata.complete();
      await navigation;
      expect(getBackup).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' } });
      expect(TestBed.inject(Router).url).toBe('/restore');
      expect(listFilesets).not.toHaveBeenCalled();
    }
  );
  it.each(['Backup', undefined])('allows %s jobs to reach version-management pages', async (OperationType) => {
    const { harness, metadata, listFilesets } = await setup('backup/:id/delete-versions', OperationType);
    const navigation = harness.navigateByUrl('/backup/42/delete-versions/select-files');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    metadata.next({ Backup: { OperationType } });
    metadata.complete();
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/backup/42/delete-versions/select-files');
    expect(listFilesets).toHaveBeenCalledTimes(1);
  });
  it('does not start file operations while job metadata is still pending', async () => {
    const { harness, metadata, listFilesets } = await setup('backup/:id/delete-versions');
    const navigation = harness.navigateByUrl('/backup/42/delete-versions/options');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(listFilesets).not.toHaveBeenCalled();
    metadata.next({ Backup: { OperationType: 'Sync' } });
    metadata.complete();
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/restore');
  });
  it.each(['backup/:id', 'backup/:id/log', 'backup/:id/delete', 'backup/:id/commandline'])(
    'does not restrict the meaningful Sync operation %s',
    async (path) => {
      const { harness, listFilesets, getBackup } = await setup(path);
      await harness.navigateByUrl('/' + path.replace(':id', '42'));
      expect(getBackup).not.toHaveBeenCalled();
      expect(TestBed.inject(Router).url).toBe('/' + path.replace(':id', '42'));
      expect(listFilesets).not.toHaveBeenCalled();
    }
  );
});
