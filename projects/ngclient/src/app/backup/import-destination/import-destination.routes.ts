import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'destination',
    pathMatch: 'full',
  },
  {
    path: 'destination',
    loadComponent: () => import('./destination/destination.component'),
  },
  {
    path: 'encryption',
    loadComponent: () => import('./encryption/encryption.component'),
  },
  {
    path: 'select-config',
    loadComponent: () => import('./select-config/select-config.component'),
  },
];

export default routes;
