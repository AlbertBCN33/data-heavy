import {
  afterNextRender,
  computed,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  runInInjectionContext,
  resource,
  signal,
} from '@angular/core';
import type { Instrument } from '@data-heavy/util';

import { isMarketDataError } from '../market-data-error';
import { MarketDataPort } from '../market-data.port';

export type LoadStatus = 'loading' | 'error' | 'ready';

/**
 * Decides when the snapshot request starts. Default: once the page has painted its first content
 * (see MarketDataStore). Tests and non-rendering contexts can start immediately: `(start) => start()`.
 */
export const MARKET_DATA_LOAD_START = new InjectionToken<
  (start: () => void) => void
>('MARKET_DATA_LOAD_START', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    return (start) =>
      runInInjectionContext(injector, () =>
        afterNextRender(() => afterFirstContentfulPaint(start)),
      );
  },
});

/**
 * The instrument universe, loaded once through the port. Shared app-wide (the screener, the
 * detail drawer and the watchlist all resolve instruments from it).
 */
@Injectable({ providedIn: 'root' })
export class MarketDataStore {
  private readonly port = inject(MarketDataPort);

  /**
   * The snapshot is fetched once the page has painted its first content, not before: on a slow
   * connection the 270 kB download would otherwise compete for bandwidth with what paints the
   * page. The page shows skeletons meanwhile; see docs/performance.md.
   */
  private readonly started = signal(false);

  private readonly data = resource({
    params: () => (this.started() ? true : undefined),
    loader: ({ abortSignal }) => this.port.loadMarketData(abortSignal),
  });

  constructor() {
    inject(MARKET_DATA_LOAD_START)(() => this.started.set(true));
  }

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

/** Upper bound on the wait, for browsers without paint timing or when FCP already happened. */
const FIRST_PAINT_FALLBACK_MS = 300;

/**
 * Runs a callback once the page has painted its first content. Chrome may hold back presenting
 * the first frames of a loading page, so a frame callback is not proof that anything is on screen;
 * the first-contentful-paint entry is. Falls back to a short timeout.
 */
function afterFirstContentfulPaint(callback: () => void): void {
  let done = false;
  const run = () => {
    if (!done) {
      done = true;
      callback();
    }
  };
  if (
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('paint')
  ) {
    const observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) {
        observer.disconnect();
        run();
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  }
  setTimeout(run, FIRST_PAINT_FALLBACK_MS);
}
