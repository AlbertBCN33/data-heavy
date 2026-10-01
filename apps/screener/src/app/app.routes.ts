import type { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    title: 'Market Screener',
    loadComponent: () =>
      import('./screener-route/screener-route').then((m) => m.ScreenerRoute),
  },
  {
    path: 'watchlist',
    title: 'Watchlist · Market Screener',
    loadComponent: () =>
      import('@data-heavy/feature-watchlist').then((m) => m.WatchlistPage),
  },
  { path: '**', redirectTo: '' },
];
