import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  type MarketData,
  MarketDataError,
  MarketDataPort,
  QUERY_WORKER_FACTORY,
} from '@data-heavy/data-access';
import { ToastService } from '@data-heavy/ui';
import { generateInstruments } from '@data-heavy/util';

import { ANNOUNCE_DELAY_MS, ScreenerPage } from './screener-page';

const instruments = generateInstruments(12, 40);

class FakePort extends MarketDataPort {
  outcome: MarketData | Error = { asOf: '2026-09-30', instruments };
  override loadMarketData = vi.fn(async () => {
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  });
  override getPriceHistory = vi.fn();
  override getWatchlist = vi.fn();
  override addToWatchlist = vi.fn();
  override removeFromWatchlist = vi.fn();
}

async function setup(url = '/', outcome?: Error) {
  const port = new FakePort();
  if (outcome) port.outcome = outcome;
  const announce = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MarketDataPort, useValue: port },
      { provide: QUERY_WORKER_FACTORY, useValue: () => null },
      { provide: LiveAnnouncer, useValue: { announce } },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(ScreenerPage);
  const root = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
    await fixture.whenStable();
  };
  await settle();
  return {
    fixture,
    root,
    port,
    announce,
    settle,
    text: () => root.textContent ?? '',
  };
}

describe('ScreenerPage', () => {
  it('has a page heading and labelled regions', async () => {
    const { root } = await setup();
    expect(root.querySelector('h1')?.textContent).toBe('Market screener');
    expect(root.querySelector('aside')?.getAttribute('aria-labelledby')).toBe(
      'dh-filters-heading',
    );
    expect(root.querySelector('section')?.getAttribute('aria-label')).toBe(
      'Results',
    );
  });

  it('shows the grid and the result count once data is loaded', async () => {
    const { root, text } = await setup();
    expect(root.querySelector('[role="grid"]')?.getAttribute('aria-busy')).toBe(
      'false',
    );
    expect(text()).toContain('40 of 40 instruments');
  });

  it('counts active filters', async () => {
    const { text } = await setup('/?q=a&type=etf&price=1..');
    expect(text()).toContain('3 active');
  });

  it('shows an empty state that can clear the filters', async () => {
    const { root, text, settle } = await setup('/?q=zzzzzz');
    expect(text()).toContain('No instruments match these filters.');

    const clear = Array.from(
      root.querySelectorAll<HTMLButtonElement>('section button'),
    ).find((b) => b.textContent?.trim() === 'Clear filters');
    clear?.click();
    await settle();
    expect(text()).toContain('40 of 40 instruments');
  });

  it('shows a retryable error and recovers', async () => {
    const { root, port, settle } = await setup(
      '/',
      new MarketDataError('network', 'offline'),
    );
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Market data could not be loaded.');

    port.outcome = { asOf: '2026-09-30', instruments };
    (alert?.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('[role="grid"]')).not.toBeNull();
  });

  it('does not offer a retry for invalid data', async () => {
    const { root } = await setup(
      '/',
      new MarketDataError('invalid-data', 'bad'),
    );
    expect(root.querySelector('[role="alert"] button')).toBeNull();
  });

  it('announces the settled result count once', async () => {
    const { announce } = await setup();
    // The delay starts during setup, so wait for it in real time.
    await new Promise((r) => setTimeout(r, ANNOUNCE_DELAY_MS + 50));
    expect(announce).toHaveBeenCalledWith('40 of 40 instruments', 'polite');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('tells the user once when a link contained invalid settings', async () => {
    await setup('/?price=cheap&sector=Crypto');
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toContain('not recognised');
  });

  it('writes row activation and sort changes to the URL', async () => {
    const { fixture, settle } = await setup();
    const page = fixture.componentInstance as unknown as {
      onRowActivate(id: string): void;
      onSortChange(sort: unknown): void;
      onColumnsChange(columns: string[]): void;
    };
    const id = (instruments[0] as (typeof instruments)[number]).id;
    page.onRowActivate(id);
    await settle();
    page.onSortChange([{ key: 'symbol', dir: 'asc' }]);
    await settle();
    page.onColumnsChange(['symbol', 'price']);
    await settle();

    const url = TestBed.inject(Router).url;
    expect(url).toContain('sort=symbol');
    expect(url).toContain('cols=symbol,price');
    expect(decodeURIComponent(url)).toContain(`sel=${id}`);
  });
});
