import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { encodeSnapshot, generateInstruments } from '@data-heavy/util';

import {
  KEY_VALUE_STORAGE,
  type KeyValueStorage,
  memoryStorage,
} from './key-value-storage';
import { MarketDataError } from './market-data-error';
import {
  MARKET_SNAPSHOT_URL,
  StaticJsonAdapter,
  WATCHLIST_STORAGE_KEY,
} from './static-json.adapter';

const instruments = generateInstruments(1, 20);
const snapshot = JSON.parse(
  JSON.stringify(encodeSnapshot(instruments, { asOf: '2026-09-30', seed: 1 })),
);
const first = instruments[0] as (typeof instruments)[number];
const second = instruments[1] as (typeof instruments)[number];

function setup(storage: KeyValueStorage = memoryStorage()) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      StaticJsonAdapter,
      { provide: KEY_VALUE_STORAGE, useValue: storage },
      { provide: MARKET_SNAPSHOT_URL, useValue: '/test/snapshot.json' },
    ],
  });
  return {
    adapter: TestBed.inject(StaticJsonAdapter),
    http: TestBed.inject(HttpTestingController),
    storage,
  };
}

/** Lets the adapter's awaited HttpClient call subscribe before asserting on requests. */
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

async function expectError(promise: Promise<unknown>, kind: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MarketDataError);
  expect((error as MarketDataError).kind).toBe(kind);
}

describe('StaticJsonAdapter', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('loadMarketData', () => {
    it('loads and decodes the snapshot', async () => {
      const { adapter, http } = setup();
      const result = adapter.loadMarketData();
      await flushMicrotasks();
      http.expectOne('/test/snapshot.json').flush(snapshot);

      expect(await result).toEqual({ asOf: '2026-09-30', instruments });
    });

    it('shares one request between concurrent callers and caches the result', async () => {
      const { adapter, http } = setup();
      const a = adapter.loadMarketData();
      const b = adapter.loadMarketData();
      await flushMicrotasks();
      http.expectOne('/test/snapshot.json').flush(snapshot);
      await Promise.all([a, b]);

      await adapter.loadMarketData();
      http.expectNone('/test/snapshot.json');
    });

    it('reports network failures as retryable and retries on the next call', async () => {
      const { adapter, http } = setup();
      const failed = adapter.loadMarketData();
      await flushMicrotasks();
      http
        .expectOne('/test/snapshot.json')
        .flush(null, { status: 503, statusText: 'Unavailable' });
      await expectError(failed, 'network');

      const retried = adapter.loadMarketData();
      await flushMicrotasks();
      http.expectOne('/test/snapshot.json').flush(snapshot);
      expect((await retried).instruments).toHaveLength(20);
    });

    it('reports a malformed snapshot as invalid data', async () => {
      const { adapter, http } = setup();
      const result = adapter.loadMarketData();
      await flushMicrotasks();
      http.expectOne('/test/snapshot.json').flush({ schemaVersion: 99 });
      await expectError(result, 'invalid-data');
    });

    it('rejects when aborted before or during the request', async () => {
      const { adapter, http } = setup();
      await expectError(adapter.loadMarketData(AbortSignal.abort()), 'aborted');

      const controller = new AbortController();
      const result = adapter.loadMarketData(controller.signal);
      await flushMicrotasks();
      controller.abort();
      http.expectOne('/test/snapshot.json').flush(snapshot);
      await expectError(result, 'aborted');
    });
  });

  describe('getPriceHistory', () => {
    it('derives a history that ends at the snapshot date and current price', async () => {
      const { adapter, http } = setup();
      const result = adapter.getPriceHistory(first.id, 30);
      await flushMicrotasks();
      http.expectOne('/test/snapshot.json').flush(snapshot);

      const history = await result;
      expect(history).toHaveLength(30);
      expect(history.at(-1)).toEqual({
        date: '2026-09-30',
        close: first.price,
      });
    });

    it('rejects unknown instruments and aborted requests', async () => {
      const { adapter, http } = setup();
      const unknown = adapter.getPriceHistory('NYSE:NOPE', 30);
      await flushMicrotasks();
      http.expectOne('/test/snapshot.json').flush(snapshot);
      await expectError(unknown, 'not-found');

      await expectError(
        adapter.getPriceHistory(first.id, 30, AbortSignal.abort()),
        'aborted',
      );

      const controller = new AbortController();
      const pending = adapter.getPriceHistory(first.id, 30, controller.signal);
      controller.abort();
      await expectError(pending, 'aborted');
    });
  });

  describe('watchlist', () => {
    it('starts empty and keeps instruments in insertion order', async () => {
      const { adapter } = setup();
      expect(await adapter.getWatchlist()).toEqual([]);

      await adapter.addToWatchlist(second.id);
      await adapter.addToWatchlist(first.id);
      expect(await adapter.getWatchlist()).toEqual([second.id, first.id]);
    });

    it('is idempotent for add and remove', async () => {
      const { adapter } = setup();
      await adapter.addToWatchlist(first.id);
      await adapter.addToWatchlist(first.id);
      expect(await adapter.getWatchlist()).toEqual([first.id]);

      await adapter.removeFromWatchlist(first.id);
      await adapter.removeFromWatchlist(first.id);
      expect(await adapter.getWatchlist()).toEqual([]);
    });

    it('persists to storage', async () => {
      const { adapter, storage } = setup();
      await adapter.addToWatchlist(first.id);
      expect(JSON.parse(storage.get(WATCHLIST_STORAGE_KEY) as string)).toEqual([
        first.id,
      ]);
    });

    it.each([
      ['corrupt JSON', '{not json', []],
      ['a non-array', '{"a":1}', []],
      [
        'invalid and duplicate ids',
        '["NYSE:ABC", 42, "bad id", "NYSE:ABC"]',
        ['NYSE:ABC'],
      ],
    ])(
      'degrades gracefully when storage holds %s',
      async (_l, raw, expected) => {
        const { adapter } = setup(
          memoryStorage({ [WATCHLIST_STORAGE_KEY]: raw }),
        );
        expect(await adapter.getWatchlist()).toEqual(expected);
      },
    );

    it('rejects malformed instrument ids', async () => {
      const { adapter } = setup();
      await expectError(adapter.addToWatchlist('nope'), 'not-found');
      await expectError(adapter.removeFromWatchlist(''), 'not-found');
    });

    it('reports a storage write failure as a retryable error', async () => {
      const failing: KeyValueStorage = {
        get: () => null,
        set: () => {
          throw new Error('QuotaExceededError');
        },
      };
      const { adapter } = setup(failing);
      await expectError(adapter.addToWatchlist(first.id), 'network');
    });

    it('rejects an aborted watchlist read', async () => {
      const { adapter } = setup();
      await expectError(adapter.getWatchlist(AbortSignal.abort()), 'aborted');
    });
  });
});
