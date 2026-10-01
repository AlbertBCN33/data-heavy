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
const simulate =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('sim') === '1';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withFetch()),
    provideI18n(),
    provideMarketData({ simulate: simulate && DEFAULT_SIMULATION }),
    // Caches the app shell and market data for offline use (see ADR 0013). Production only:
    // a service worker in development would serve stale code.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
