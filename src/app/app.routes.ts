import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AppAuthState } from './core/states/app-auth.state';
import { SysinfoState } from './core/states/sysinfo.state';

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
            canActivate: [() => inject(SysinfoState).sysInfoObservable()],
            loadComponent: () => import('./backup/backup.component'),
            loadChildren: () => import('./backup/backup.routes'),
          },
          {
            path: 'backup/:id',
            canActivateChild: [() => inject(SysinfoState).sysInfoObservable()],
            loadComponent: () => import('./backup/backup.component'),
            loadChildren: () => import('./backup/backup.routes'),
          },
          {
            path: 'restore',
            loadComponent: () => import('./restore/restore.component'),
          },
          {
            path: 'restore-flow/:id',
            loadComponent: () => import('./restore-flow/restore-flow.component'),
            children: [
              {
                path: '',
                redirectTo: 'select-files',
                pathMatch: 'full',
              },
              {
                path: 'select-files',
                loadComponent: () => import('./restore-flow/select-files/select-files.component'),
              },
              {
                path: 'options',
                loadComponent: () => import('./restore-flow/options/options.component'),
              },
            ],
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
