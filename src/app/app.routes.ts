import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    // canActivate: [() => socketConnection],
    children: [
      {
        path: 'login',
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
            path: 'backup/:id',
            loadComponent: () => import('./backup/backup.component'),
            children: [
              {
                path: '',
                redirectTo: 'general',
                pathMatch: 'full',
              },
              {
                path: 'general',
                loadComponent: () => import('./backup/general/general.component'),
              },
              {
                path: 'destination',
                loadComponent: () => import('./backup/destination/destination.component'),
              },
              {
                path: 'source-data',
                loadComponent: () => import('./backup/source-data/source-data.component'),
              },
              {
                path: 'schedule',
                loadComponent: () => import('./backup/schedule/schedule.component'),
              },
              {
                path: 'options',
                loadComponent: () => import('./backup/options/options.component'),
              },
            ],
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
