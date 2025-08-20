import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./logs.component'),
    children: [
      {
        path: '',
        redirectTo: 'stored',
        pathMatch: 'full',
      },
      {
        path: 'stored',
        loadComponent: () => import('./logs-stored/logs-stored.component'),
      },
      {
        path: 'live',
        loadComponent: () => import('./logs-live/logs-live.component'),
      },
    ],
  },
];

export default routes;
