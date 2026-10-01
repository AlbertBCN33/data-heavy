import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  DEFAULT_SIMULATION,
  provideMarketData,
} from '@data-heavy/data-access/providers';

import { appRoutes } from './app.routes';

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
    provideMarketData({ simulate: simulate && DEFAULT_SIMULATION }),
  ],
};
