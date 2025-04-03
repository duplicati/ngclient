import { inject, Injector } from '@angular/core';
import { Routes } from '@angular/router';
import { map, of, switchMap, zip } from 'rxjs';
import { StatusBarState } from './core/components/status-bar/status-bar.state';
import { AppAuthState } from './core/states/app-auth.state';
import { RelayconfigState } from './core/states/relayconfig.state';
import { SysinfoState } from './core/states/sysinfo.state';
import { WebModulesState } from './core/states/webmodules.state';

export const TokenInMemoryGuard = () => {
  const auth = inject(AppAuthState);

  if (auth.token()) {
    return true;
  } else {
    return auth.checkProxyAuthed().pipe(
      switchMap((authed) => {
        if (authed) {
          return of(true);
        }

        return auth.refreshToken().pipe(map(() => true));
      })
    );
  }
};

export const PreloadGuard = () => {
  const relayconfigState = inject(RelayconfigState);
  const statusBarState = inject(StatusBarState);
  const injector = inject(Injector);
  const defaultConnectionMethod = relayconfigState.relayIsEnabled() ? 'longpoll' : 'websocket';

  // NOTE - The injects are happning twice because we use toSignal inside so
  // when injected they fire requests this is why they cant be combined
  const zipArr = [
    injector.get(SysinfoState).preload(true),
    injector.get(SysinfoState).preloadFilterGroups(true),
    injector.get(WebModulesState).preload(true),
  ];

  if (relayconfigState.configLoaded === null) return zip(zipArr).pipe(map(() => defaultConnectionMethod));

  return relayconfigState.configLoaded?.pipe(switchMap(() => zip(zipArr)));
};

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'login',
        canActivate: [
          // () => {
          //   const appAuthState = inject(AppAuthState);
          //   const router = inject(Router);
          //   return appAuthState.refreshToken().pipe(
          //     take(1),
          //     map((res) => {
          //       if (res.AccessToken) {
          //         router.navigate(['/']);
          //       }
          //     }),
          //     catchError((err) => {
          //       return of(true);
          //     })
          //   );
          // },
        ],
        loadComponent: () => import('./login/login.component'),
      },
      {
        path: 'logout',
        loadComponent: () => import('./logout/logout.component'),
      },
      {
        path: '',
        canActivate: [TokenInMemoryGuard],
        children: [
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
                path: 'backup/:id/commandline/:runId',
                loadComponent: () => import('./backup/commandline-result/commandline-result.component'),
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
                    loadChildren: () => import('./about/logs/logs.routes'),
                  },
                  {
                    path: 'crashlogs',
                    loadComponent: () => import('./about/crashlogs/crashlogs.component'),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
