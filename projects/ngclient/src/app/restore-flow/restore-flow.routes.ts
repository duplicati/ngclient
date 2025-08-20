import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'select-files',
    pathMatch: 'full',
  },
  {
    path: 'destination',
    loadComponent: () => import('./restore-destination/restore-destination.component'),
  },
  {
    path: 'encryption',
    loadComponent: () => import('./restore-encryption/restore-encryption.component'),
  },
  {
    path: 'select-files',
    loadComponent: () => import('./select-files/select-files.component'),
  },
  {
    path: 'options',
    loadComponent: () => import('./options/options.component'),
  },
  {
    path: ':taskid/progress',
    loadComponent: () => import('./restore-progress/restore-progress.component'),
  },
];

export default routes;
