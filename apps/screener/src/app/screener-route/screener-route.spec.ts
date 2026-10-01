import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MarketDataPort, QUERY_WORKER_FACTORY } from '@data-heavy/data-access';

import { ScreenerRoute } from './screener-route';

/** Resolves with an empty dataset: a pending load would keep the app from becoming stable. */
class EmptyPort extends MarketDataPort {
  override loadMarketData = vi.fn(async () => ({
    asOf: '2026-09-30',
    instruments: [],
  }));
  override getPriceHistory = vi.fn();
  override getWatchlist = vi.fn();
  override addToWatchlist = vi.fn();
  override removeFromWatchlist = vi.fn();
}

async function setup(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MarketDataPort, useClass: EmptyPort },
      { provide: QUERY_WORKER_FACTORY, useValue: () => null },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(ScreenerRoute);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ScreenerRoute', () => {
  it('renders the screener', async () => {
    const root = await setup('/');
    expect(root.querySelector('dh-screener-page')).not.toBeNull();
  });

  it('does not render the detail drawer without a selection', async () => {
    expect((await setup('/')).querySelector('dh-instrument-drawer')).toBeNull();
  });

  it('renders the detail drawer once something is selected', async () => {
    const root = await setup('/?sel=NYSE:ABC');
    expect(root.querySelector('dh-instrument-drawer')).not.toBeNull();
  });
});
