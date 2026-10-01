import type { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    // Titles are translation keys, translated by TranslatedTitleStrategy.
    title: 'titles.screener',
    loadComponent: () =>
      import('./screener-route/screener-route').then((m) => m.ScreenerRoute),
  },
  {
    path: 'watchlist',
    title: 'titles.watchlist',
    loadComponent: () =>
      import('@data-heavy/feature-watchlist').then((m) => m.WatchlistPage),
  },
  { path: '**', redirectTo: '' },
];
