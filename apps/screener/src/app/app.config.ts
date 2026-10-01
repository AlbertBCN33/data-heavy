import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  DEFAULT_SIMULATION,
  provideMarketData,
} from '@data-heavy/data-access/providers';

import { appRoutes } from './app.routes';
import { provideI18n } from './i18n/provide-i18n';

/**
 * `?sim=1` wraps the data adapter with simulated latency and failures, to demonstrate loading,
 * error and retry states. Read once at startup: the adapter is chosen for the whole session.
 */
const params = new URLSearchParams(
  typeof location === 'undefined' ? '' : location.search,
);
const simulate = params.get('sim') === '1';

/** `?rows=50000`: the 50k-row stress dataset (generated at build time, loaded only on demand). */
const stress = params.get('rows') === '50000';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withFetch()),
    provideI18n(),
    provideMarketData({
      simulate: simulate && DEFAULT_SIMULATION,
      snapshotUrl: stress ? 'data/market-snapshot-50k.json' : undefined,
    }),
    // Caches the app shell and market data for offline use (see ADR 0013). Production only:
    // a service worker in development would serve stale code.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
