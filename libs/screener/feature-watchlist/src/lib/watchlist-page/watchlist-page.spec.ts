import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  KEY_VALUE_STORAGE,
  type MarketData,
  MarketDataError,
  MarketDataPort,
  memoryStorage,
} from '@data-heavy/data-access';
import { generateInstruments, type Instrument } from '@data-heavy/util';

import { WatchlistPage } from './watchlist-page';

const instruments = generateInstruments(31, 10);
const [a, b, c] = instruments as [Instrument, Instrument, Instrument];

class FakePort extends MarketDataPort {
  watchlist: string[] = [a.id, b.id, c.id];
  failWatchlist = false;
  override loadMarketData = vi.fn(
    async (): Promise<MarketData> => ({ asOf: '2026-09-30', instruments }),
  );
  override getWatchlist = vi.fn(async () => {
    if (this.failWatchlist) throw new MarketDataError('network', 'down');
    return [...this.watchlist];
  });
  override addToWatchlist = vi.fn(async () => undefined);
  override removeFromWatchlist = vi.fn(async () => undefined);
  override getPriceHistory = vi.fn();
}

async function setup(port = new FakePort()) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MarketDataPort, useValue: port },
      { provide: KEY_VALUE_STORAGE, useValue: memoryStorage() },
    ],
  });
  const fixture = TestBed.createComponent(WatchlistPage);
  document.body.appendChild(fixture.nativeElement);
  const root = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise((r) => setTimeout(r));
    }
  };
  await settle();
  return withHelpers(fixture, root, port, settle);
}

/** For a market load that never settles: `whenStable` would wait on it forever. */
async function setupWithPendingMarketData(port: FakePort) {
  port.loadMarketData.mockImplementation(() => new Promise(() => undefined));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MarketDataPort, useValue: port },
      { provide: KEY_VALUE_STORAGE, useValue: memoryStorage() },
    ],
  });
  const fixture = TestBed.createComponent(WatchlistPage);
  const root = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  }
  return root;
}

function withHelpers(
  fixture: ReturnType<typeof TestBed.createComponent<WatchlistPage>>,
  root: HTMLElement,
  port: FakePort,
  settle: () => Promise<void>,
) {
  const removeButtons = () =>
    Array.from(
      root.querySelectorAll<HTMLButtonElement>('.dh-watchlist__remove'),
    );
  return { fixture, root, port, settle, removeButtons };
}

describe('WatchlistPage', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('lists watched instruments in order, linking each to the screener', async () => {
    const { root } = await setup();
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Watchlist');
    expect(root.querySelector('caption')?.textContent?.trim()).toBe(
      '3 watched instruments',
    );
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>('tbody th a'),
    );
    expect(links.map((l) => l.textContent?.trim())).toEqual([
      a.symbol,
      b.symbol,
      c.symbol,
    ]);
    expect(decodeURIComponent(links[0]?.getAttribute('href') ?? '')).toBe(
      `/?sel=${a.id}`,
    );
  });

  it('labels each remove button with the instrument', async () => {
    const { removeButtons } = await setup();
    expect(removeButtons()[1]?.getAttribute('aria-label')).toBe(
      `Remove ${b.symbol} from watchlist`,
    );
  });

  it('removes optimistically and moves focus to the next row', async () => {
    const { root, port, settle, removeButtons } = await setup();
    removeButtons()[1]?.click();
    await settle();

    expect(port.removeFromWatchlist).toHaveBeenCalledWith(b.id);
    const symbols = Array.from(root.querySelectorAll('tbody th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(symbols).toEqual([a.symbol, c.symbol]);
    expect(document.activeElement).toBe(removeButtons()[1]);
  });

  it('moves focus to the heading when the last item is removed', async () => {
    const port = new FakePort();
    port.watchlist = [a.id];
    const { root, settle, removeButtons } = await setup(port);
    removeButtons()[0]?.click();
    await settle();
    expect(root.textContent).toContain('Your watchlist is empty.');
    expect(document.activeElement).toBe(root.querySelector('h1'));
  });

  it('shows an empty state that points to the screener', async () => {
    const port = new FakePort();
    port.watchlist = [];
    const { root } = await setup(port);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  it('shows the empty state without waiting for market data', async () => {
    const port = new FakePort();
    port.watchlist = [];
    const root = await setupWithPendingMarketData(port);
    expect(root.textContent).toContain('Your watchlist is empty.');
    expect(root.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('waits for market data before listing watched instruments', async () => {
    const root = await setupWithPendingMarketData(new FakePort());
    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(root.querySelector('table')).toBeNull();
  });

  it('reports a market data error when there are instruments to show', async () => {
    const port = new FakePort();
    port.loadMarketData.mockRejectedValue(
      new MarketDataError('network', 'down'),
    );
    const { root } = await setup(port);
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('shows a retryable error', async () => {
    const port = new FakePort();
    port.failWatchlist = true;
    const { root, settle } = await setup(port);
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('could not be loaded');

    port.failWatchlist = false;
    alert?.querySelector('button')?.click();
    await settle();
    expect(root.querySelector('table')).not.toBeNull();
  });

  it('says how many changes wait for the connection', async () => {
    let online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    const { root, settle, removeButtons } = await setup();
    online = false;
    window.dispatchEvent(new Event('offline'));
    removeButtons()[0]?.click();
    await settle();
    expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe(
      "1 change will be saved when you're back online.",
    );
    vi.restoreAllMocks();
  });
});
