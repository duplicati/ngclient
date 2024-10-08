import { Routes } from '@angular/router';

export default <Routes>[
  {
    path: '',
    redirectTo: 'general',
    pathMatch: 'full',
  },
  {
    path: 'general',
    loadComponent: () => import('./general/general.component'),
  },
  {
    path: 'destination',
    loadComponent: () => import('./destination/destination.component'),
  },
  {
    path: 'source-data',
    loadComponent: () => import('./source-data/source-data.component'),
  },
  {
    path: 'schedule',
    loadComponent: () => import('./schedule/schedule.component'),
  },
  {
    path: 'options',
    loadComponent: () => import('./options/options.component'),
  },
];
