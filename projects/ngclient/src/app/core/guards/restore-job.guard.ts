import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { defer, map } from 'rxjs';
import { DuplicatiServer } from '../openapi';

// Check metadata before a restore or version-based page can start file-list requests.
export const RestoreJobGuard: CanActivateFn = (route) => {
  const server = inject(DuplicatiServer);
  const router = inject(Router);
  const id = route.paramMap.get('id');
  if (!id) return router.createUrlTree(['/restore']);

  return defer(() => server.getApiV1BackupById({ path: { id } })).pipe(
    map((job) => (job.Backup?.OperationType === 'Sync' ? router.createUrlTree(['/restore']) : true))
  );
};
