import { inject, Injector } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { switchMap, zip } from 'rxjs';
import { AppAuthState } from './core/states/app-auth.state';
import { RelayconfigState } from './core/states/relayconfig.state';
import { SysinfoState } from './core/states/sysinfo.state';
import { WebModulesState } from './core/states/webmodules.state';

export const PreloadGuard = () => {
  const relayconfigState = inject(RelayconfigState);
  const injector = inject(Injector);

  // NOTE - The injects are happning twice because we use toSignal inside so
  // when injected they fire requests this is why they cant be combined
  if (relayconfigState.configLoaded === null)
    return zip([injector.get(SysinfoState).preload(true), injector.get(WebModulesState).preload(true)]);

  return relayconfigState.configLoaded?.pipe(
    switchMap(() => zip([injector.get(SysinfoState).preload(true), injector.get(WebModulesState).preload(true)]))
  );
};

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'login',
        canActivate: [() => (inject(AppAuthState).token() !== null ? inject(Router).navigate(['/']) : true)],
        loadComponent: () => import('./login/login.component'),
      },
      {
        path: 'logout',
        loadComponent: () => import('./logout/logout.component'),
      },
      {
        path: '',
        // If in iframe wait for relay...
        canActivate: [PreloadGuard],
        loadComponent: () => import('./layout/layout.component'),
        children: [
          {
            path: '',
            loadComponent: () => import('./home/home.component'),
          },
          {
            path: 'add-backup',
            loadComponent: () => import('./add-backup/add-backup.component'),
          },
          {
            path: 'backup/:id/export',
            loadComponent: () => import('./backup/export/export.component'),
          },
          {
            path: 'backup/import',
            loadComponent: () => import('./backup/import/import.component'),
          },
          {
            path: 'backup-draft/:id',
            loadComponent: () => import('./backup/backup.component'),
            loadChildren: () => import('./backup/backup.routes'),
          },
          {
            path: 'backup/:id',
            loadComponent: () => import('./backup/backup.component'),
            loadChildren: () => import('./backup/backup.routes'),
          },
          {
            path: 'backup/:id/log',
            loadComponent: () => import('./backup/log/log.component'),
          },
          {
            path: 'backup/:id/database',
            loadComponent: () => import('./backup/database/database.component'),
          },
          {
            path: 'backup/:id/commandline',
            loadComponent: () => import('./backup/commandline/commandline.component'),
          },
          {
            path: 'restore',
            children: [
              {
                path: '',
                loadComponent: () => import('./restore/restore.component'),
              },
              {
                path: 'from-config',
                loadComponent: () => import('./restore/restore-from-config/restore-from-config.component'),
              },
            ],
          },
          {
            path: 'restore-from-files',
            loadComponent: () => import('./restore-flow/restore-flow.component'),
            loadChildren: () => import('./restore-flow/restore-flow.routes'),
          },
          {
            path: 'restore-draft/:id',
            loadComponent: () => import('./restore-flow/restore-flow.component'),
            loadChildren: () => import('./restore-flow/restore-flow.routes'),
          },
          {
            path: 'restore/:id',
            loadComponent: () => import('./restore-flow/restore-flow.component'),
            loadChildren: () => import('./restore-flow/restore-flow.routes'),
          },
          {
            path: 'settings',
            loadComponent: () => import('./settings/settings.component'),
          },
          {
            path: 'about',
            loadComponent: () => import('./about/about.component'),
            children: [
              {
                path: '',
                redirectTo: 'general',
                pathMatch: 'full',
              },
              {
                path: 'general',
                loadComponent: () => import('./about/general/general.component'),
              },
              {
                path: 'changelog',
                loadComponent: () => import('./about/changelog/changelog.component'),
              },
              {
                path: 'libraries',
                loadComponent: () => import('./about/libraries/libraries.component'),
              },
              {
                path: 'system-info',
                loadComponent: () => import('./about/system-info/system-info.component'),
              },
              {
                path: 'logs',
                loadComponent: () => import('./about/logs/logs.component'),
              },
            ],
          },
        ],
      },
    ],
  },
];
