import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  decodeSnapshot,
  generatePriceHistory,
  type Instrument,
  INSTRUMENT_ID_PATTERN,
  type PricePoint,
  SnapshotFormatError,
} from '@data-heavy/util';
import { firstValueFrom } from 'rxjs';

import { KEY_VALUE_STORAGE } from './key-value-storage';
import { MarketDataError, throwIfAborted } from './market-data-error';
import { type MarketData, MarketDataPort } from './market-data.port';

/** Relative so the app works under any base href. */
export const MARKET_SNAPSHOT_URL = new InjectionToken<string>(
  'MARKET_SNAPSHOT_URL',
  { providedIn: 'root', factory: () => 'data/market-snapshot.json' },
);

export const WATCHLIST_STORAGE_KEY = 'dh.watchlist.v1';

/**
 * Default adapter: the bundled, generated snapshot plays the role of the market data API.
 *
 * - The snapshot is fetched and validated once; concurrent callers share the request, and a
 *   failed request is not cached so the next call retries.
 * - Price histories are derived deterministically from the instrument instead of shipped.
 * - The watchlist is persisted in browser storage, standing in for a user-scoped endpoint.
 */
@Injectable()
export class StaticJsonAdapter extends MarketDataPort {
  private readonly http = inject(HttpClient);
  private readonly url = inject(MARKET_SNAPSHOT_URL);
  private readonly storage = inject(KEY_VALUE_STORAGE);

  private snapshot: Promise<
    MarketData & { byId: ReadonlyMap<string, Instrument> }
  > | null = null;

  override async loadMarketData(signal?: AbortSignal): Promise<MarketData> {
    throwIfAborted(signal);
    const { asOf, instruments } = await this.loadSnapshot();
    throwIfAborted(signal);
    return { asOf, instruments };
  }

  override async getPriceHistory(
    instrumentId: string,
    tradingDays: number,
    signal?: AbortSignal,
  ): Promise<readonly PricePoint[]> {
    throwIfAborted(signal);
    const { asOf, byId } = await this.loadSnapshot();
    throwIfAborted(signal);
    const instrument = byId.get(instrumentId);
    if (!instrument) {
      throw new MarketDataError(
        'not-found',
        `Unknown instrument "${instrumentId}"`,
      );
    }
    return generatePriceHistory(instrument, { endDate: asOf, tradingDays });
  }

  override async getWatchlist(
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    throwIfAborted(signal);
    return this.readWatchlist();
  }

  override async addToWatchlist(instrumentId: string): Promise<void> {
    assertValidId(instrumentId);
    const ids = this.readWatchlist();
    if (!ids.includes(instrumentId)) {
      this.writeWatchlist([...ids, instrumentId]);
    }
  }

  override async removeFromWatchlist(instrumentId: string): Promise<void> {
    assertValidId(instrumentId);
    const ids = this.readWatchlist();
    if (ids.includes(instrumentId)) {
      this.writeWatchlist(ids.filter((id) => id !== instrumentId));
    }
  }

  private loadSnapshot(): Promise<
    MarketData & { byId: ReadonlyMap<string, Instrument> }
  > {
    this.snapshot ??= this.fetchSnapshot().catch((error: unknown) => {
      this.snapshot = null;
      throw error;
    });
    return this.snapshot;
  }

  private async fetchSnapshot(): Promise<
    MarketData & { byId: ReadonlyMap<string, Instrument> }
  > {
    let body: unknown;
    try {
      body = await firstValueFrom(this.http.get<unknown>(this.url));
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      throw new MarketDataError(
        'network',
        `Market data request failed (status ${status})`,
        { cause: error },
      );
    }
    try {
      const { asOf, instruments } = decodeSnapshot(body);
      return {
        asOf,
        instruments,
        byId: new Map(instruments.map((i) => [i.id, i])),
      };
    } catch (error) {
      if (error instanceof SnapshotFormatError) {
        throw new MarketDataError('invalid-data', error.message, {
          cause: error,
        });
      }
      throw error;
    }
  }

  /** Corrupt or tampered storage degrades to an empty or partial list, never an error. */
  private readWatchlist(): string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.get(WATCHLIST_STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const ids = parsed.filter(
      (id): id is string =>
        typeof id === 'string' && INSTRUMENT_ID_PATTERN.test(id),
    );
    return [...new Set(ids)];
  }

  private writeWatchlist(ids: readonly string[]): void {
    try {
      this.storage.set(WATCHLIST_STORAGE_KEY, JSON.stringify(ids));
    } catch (error) {
      throw new MarketDataError('network', 'Could not save the watchlist', {
        cause: error,
      });
    }
  }
}

function assertValidId(instrumentId: string): void {
  if (!INSTRUMENT_ID_PATTERN.test(instrumentId)) {
    throw new MarketDataError(
      'not-found',
      `Invalid instrument id "${instrumentId}"`,
    );
  }
}
