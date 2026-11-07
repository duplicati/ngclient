import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { defer, map } from 'rxjs';
import { DuplicatiServer } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';

// Check metadata before a version-management page (delete versions, purge files, version labels,
// broken files) starts requests that need a backup database. A Sync job has no backup database;
// its versions are restored through the restore flow instead, see SyncRestoreGuard.
export const RestoreJobGuard: CanActivateFn = (route) => {
  const server = inject(DuplicatiServer);
  const router = inject(Router);
  const id = route.paramMap.get('id');
  if (!id) return router.createUrlTree(['/restore']);

  return defer(() => server.getApiV1BackupById({ path: { id } })).pipe(
    map((job) => (job.Backup?.OperationType === 'Sync' ? router.createUrlTree(['/restore']) : true))
  );
};

// The restore flow lists versions as soon as it opens. A server that can restore Sync jobs lets
// every job in without fetching metadata; an older server refuses those requests for a Sync job,
// so the job is sent back to the restore page as on the version-management pages.
export const SyncRestoreGuard: CanActivateFn = (route, state) =>
  inject(SysinfoState).hasSyncRestore() ? true : RestoreJobGuard(route, state);
