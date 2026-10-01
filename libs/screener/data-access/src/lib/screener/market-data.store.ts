import { computed, inject, Injectable, resource } from '@angular/core';
import type { Instrument } from '@data-heavy/util';

import { isMarketDataError } from '../market-data-error';
import { MarketDataPort } from '../market-data.port';

export type LoadStatus = 'loading' | 'error' | 'ready';

/**
 * The instrument universe, loaded once through the port. Shared app-wide (the screener, the
 * detail drawer and the watchlist all resolve instruments from it).
 */
@Injectable({ providedIn: 'root' })
export class MarketDataStore {
  private readonly port = inject(MarketDataPort);

  private readonly data = resource({
    loader: ({ abortSignal }) => this.port.loadMarketData(abortSignal),
  });

  readonly status = computed<LoadStatus>(() => {
    if (this.data.hasValue()) {
      return 'ready';
    }
    return this.data.status() === 'error' ? 'error' : 'loading';
  });

  readonly instruments = computed<readonly Instrument[]>(() =>
    this.data.hasValue() ? this.data.value().instruments : [],
  );

  readonly asOf = computed(() =>
    this.data.hasValue() ? this.data.value().asOf : null,
  );

  readonly byId = computed(
    () => new Map(this.instruments().map((i) => [i.id, i])),
  );

  /** Whether retrying can help (network errors) or not (invalid data). */
  readonly retryable = computed(() => {
    const error = this.data.error();
    return !isMarketDataError(error) || error.retryable;
  });

  reload(): void {
    this.data.reload();
  }
}
