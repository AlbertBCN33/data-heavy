import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { generateInstruments } from '@data-heavy/util';

import { type MarketData, MarketDataPort } from '../market-data.port';
import { QUERY_WORKER_FACTORY } from '../query/query-runner';
import { provideScreenerStore, ScreenerStore } from './screener.store';

const instruments = generateInstruments(8, 60);

class FakePort extends MarketDataPort {
  override loadMarketData = vi.fn(
    async (): Promise<MarketData> => ({ asOf: '2026-09-30', instruments }),
  );
  override getPriceHistory = vi.fn();
  override getWatchlist = vi.fn();
  override addToWatchlist = vi.fn();
  override removeFromWatchlist = vi.fn();
}

async function setup(url = '/') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideScreenerStore(),
      { provide: MarketDataPort, useClass: FakePort },
      // Main-thread engine: deterministic in jsdom.
      { provide: QUERY_WORKER_FACTORY, useValue: () => null },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  return TestBed.inject(ScreenerStore);
}

async function settle() {
  await TestBed.inject(ApplicationRef).whenStable();
  await new Promise((r) => setTimeout(r));
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('ScreenerStore', () => {
  it('is pending until the first result, then shows rows in the default order', async () => {
    const store = await setup();
    expect(store.pending()).toBe(true);
    expect(store.rows()).toEqual([]);

    await settle();
    expect(store.pending()).toBe(false);
    expect(store.total()).toBe(60);
    expect(store.rows()).toHaveLength(60);
    const caps = store.rows().map((r) => r.marketCapUsd);
    expect(caps).toEqual([...caps].sort((a, b) => b - a));
    expect(store.lastQueryMs()).not.toBeNull();
    expect(store.onWorker()).toBe(false);
  });

  it('applies filters from the URL', async () => {
    const store = await setup('/?type=etf');
    await settle();
    expect(store.rows().length).toBeGreaterThan(0);
    expect(store.rows().every((r) => r.type === 'etf')).toBe(true);
  });

  it('re-runs the query when the view changes through update()', async () => {
    const store = await setup();
    await settle();
    store.update({ selects: { exchange: ['TSE'] } });
    await settle();
    expect(store.rows().every((r) => r.exchange === 'TSE')).toBe(true);
    expect(store.view().selects).toEqual({ exchange: ['TSE'] });
  });

  it('does not re-run the query for selection or column changes', async () => {
    const store = await setup();
    await settle();
    const before = store.rows();
    store.update({ selected: 'NYSE:ABC', columns: ['symbol', 'price'] });
    await settle();
    expect(store.rows()).toBe(before);
  });

  it('resets filters and sort but keeps columns and selection', async () => {
    const store = await setup(
      '/?q=a&type=etf&sort=symbol&cols=symbol,price&sel=NYSE:ABC',
    );
    await settle();
    store.reset();
    await settle();
    expect(store.view()).toMatchObject({
      text: '',
      selects: {},
      sort: [{ key: 'marketCapUsd', dir: 'desc' }],
      columns: ['symbol', 'price'],
      selected: 'NYSE:ABC',
    });
  });

  it('reloads market data through the shared store', async () => {
    const store = await setup();
    await settle();
    const port = TestBed.inject(MarketDataPort) as FakePort;
    store.reload();
    await settle();
    expect(port.loadMarketData).toHaveBeenCalledTimes(2);
  });
});
