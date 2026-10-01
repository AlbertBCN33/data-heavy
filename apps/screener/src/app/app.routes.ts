import type { Route } from '@angular/router';

import { ScreenerRoute } from './screener-route/screener-route';

export const appRoutes: Route[] = [
  {
    path: '',
    // Titles are translation keys, translated by TranslatedTitleStrategy.
    title: 'titles.screener',
    // The landing page is eager: lazy-loading it would chain its chunks behind main.js and delay
    // the first meaningful paint (see docs/performance.md). Its drawer and chart stay deferred.
    component: ScreenerRoute,
  },
  {
    path: 'watchlist',
    title: 'titles.watchlist',
    loadComponent: () =>
      import('@data-heavy/feature-watchlist').then((m) => m.WatchlistPage),
  },
  { path: '**', redirectTo: '' },
];
