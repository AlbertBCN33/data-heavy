import type { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    title: 'Market Screener',
    loadComponent: () =>
      import('@data-heavy/feature-screener').then((m) => m.ScreenerPage),
  },
  { path: '**', redirectTo: '' },
];
