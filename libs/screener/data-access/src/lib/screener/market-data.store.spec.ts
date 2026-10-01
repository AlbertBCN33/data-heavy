import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { generateInstruments } from '@data-heavy/util';

import { MarketDataError } from '../market-data-error';
import { type MarketData, MarketDataPort } from '../market-data.port';
import { MarketDataStore } from './market-data.store';

const instruments = generateInstruments(6, 10);

class FakePort extends MarketDataPort {
  outcomes: (MarketData | Error)[] = [];
  override async loadMarketData(): Promise<MarketData> {
    const next = this.outcomes.shift();
    if (!next) throw new Error('no outcome queued');
    if (next instanceof Error) throw next;
    return next;
  }
  override getPriceHistory = vi.fn();
  override getWatchlist = vi.fn();
  override addToWatchlist = vi.fn();
  override removeFromWatchlist = vi.fn();
}

function setup(...outcomes: (MarketData | Error)[]) {
  const port = new FakePort();
  port.outcomes = outcomes;
  TestBed.configureTestingModule({
    providers: [{ provide: MarketDataPort, useValue: port }],
  });
  return TestBed.inject(MarketDataStore);
}

const settle = () => TestBed.inject(ApplicationRef).whenStable();

describe('MarketDataStore', () => {
  it('loads instruments and indexes them by id', async () => {
    const store = setup({ asOf: '2026-09-30', instruments });
    expect(store.status()).toBe('loading');
    expect(store.instruments()).toEqual([]);

    await settle();
    expect(store.status()).toBe('ready');
    expect(store.asOf()).toBe('2026-09-30');
    expect(store.instruments()).toBe(instruments);
    const first = instruments[0] as (typeof instruments)[number];
    expect(store.byId().get(first.id)).toBe(first);
  });

  it('exposes retryable errors and recovers on reload', async () => {
    const store = setup(new MarketDataError('network', 'offline'), {
      asOf: '2026-09-30',
      instruments,
    });
    await settle();
    expect(store.status()).toBe('error');
    expect(store.retryable()).toBe(true);
    expect(store.asOf()).toBeNull();

    store.reload();
    await settle();
    expect(store.status()).toBe('ready');
  });

  it('marks invalid data as not retryable', async () => {
    const store = setup(new MarketDataError('invalid-data', 'bad file'));
    await settle();
    expect(store.status()).toBe('error');
    expect(store.retryable()).toBe(false);
  });
});
