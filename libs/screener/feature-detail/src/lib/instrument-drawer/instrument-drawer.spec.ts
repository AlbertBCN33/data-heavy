import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  type MarketData,
  MarketDataError,
  MarketDataPort,
} from '@data-heavy/data-access';
import {
  generateInstruments,
  generatePriceHistory,
  type Instrument,
} from '@data-heavy/util';

import { InstrumentDrawer } from './instrument-drawer';

const instruments = generateInstruments(21, 5);
const target = instruments[0] as Instrument;

class FakePort extends MarketDataPort {
  historyOutcome: 'ok' | MarketDataError = 'ok';
  override loadMarketData = vi.fn(
    async (): Promise<MarketData> => ({ asOf: '2026-09-30', instruments }),
  );
  override getPriceHistory = vi.fn(async (id: string, days: number) => {
    if (this.historyOutcome !== 'ok') throw this.historyOutcome;
    const instrument = instruments.find((i) => i.id === id) as Instrument;
    return generatePriceHistory(instrument, {
      endDate: '2026-09-30',
      tradingDays: days,
    });
  });
  override getWatchlist = vi.fn();
  override addToWatchlist = vi.fn();
  override removeFromWatchlist = vi.fn();
}

async function setup(url: string, port = new FakePort()) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: MarketDataPort, useValue: port }],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(InstrumentDrawer);
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
  const button = (name: string) =>
    Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === name,
    ) as HTMLButtonElement | undefined;
  return { fixture, root, router, port, settle, button };
}

describe('InstrumentDrawer', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('stays closed without a selection', async () => {
    const { root } = await setup('/');
    expect(root.querySelector('dialog')?.open).toBe(false);
  });

  it('opens for the selected instrument, titled with symbol and name', async () => {
    const { root } = await setup(`/?sel=${target.id}`);
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.classList).toContain('dh-dialog--drawer');
    expect(dialog.querySelector('h2')?.textContent).toBe(
      `${target.symbol} · ${target.name}`,
    );
  });

  it('lists key statistics as a description list', async () => {
    const { root } = await setup(`/?sel=${target.id}`);
    const terms = Array.from(root.querySelectorAll('dt')).map(
      (dt) => dt.textContent,
    );
    expect(terms).toContain('Market cap');
    expect(terms).toContain('52-week range');
    expect(root.querySelectorAll('dd')).toHaveLength(terms.length);
  });

  it('loads a one-year chart by default and reloads when the range changes', async () => {
    const { root, port, settle } = await setup(`/?sel=${target.id}`);
    expect(port.getPriceHistory).toHaveBeenLastCalledWith(
      target.id,
      252,
      expect.any(AbortSignal),
    );
    expect(
      root.querySelector('dh-price-chart figcaption')?.textContent,
    ).toMatch(/^(Up|Down|Unchanged)/);

    const oneMonth = root.querySelector(
      'input[type="radio"][value="1M"]',
    ) as HTMLInputElement;
    expect(oneMonth.closest('label')?.textContent).toContain('1 month');
    oneMonth.click();
    await settle();
    expect(port.getPriceHistory).toHaveBeenLastCalledWith(
      target.id,
      21,
      expect.any(AbortSignal),
    );
  });

  it('offers the price series as a data table', async () => {
    const { root, button, settle } = await setup(`/?sel=${target.id}`);
    const toggle = button('Show price table') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('dh-detail-table');

    toggle.click();
    await settle();
    const table = root.querySelector(
      '#dh-detail-table table',
    ) as HTMLTableElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(table.caption?.textContent?.trim()).toBe(
      'Daily closing prices, most recent first',
    );
    expect(table.tBodies[0]?.rows).toHaveLength(252);
    expect(table.tBodies[0]?.rows[0]?.querySelector('th')?.textContent).toBe(
      'Sep 30, 2026',
    );
  });

  it('shows a retryable error for the price history and recovers', async () => {
    const port = new FakePort();
    port.historyOutcome = new MarketDataError('network', 'offline');
    const { root, button, settle } = await setup(`/?sel=${target.id}`, port);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Price history could not be loaded.',
    );

    port.historyOutcome = 'ok';
    button('Try again')?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('dh-price-chart')).not.toBeNull();
  });

  it('does not offer a retry for non-retryable history errors', async () => {
    const port = new FakePort();
    port.historyOutcome = new MarketDataError('not-found', 'gone');
    const { button } = await setup(`/?sel=${target.id}`, port);
    expect(button('Try again')).toBeUndefined();
  });

  it('explains when the selected instrument does not exist', async () => {
    const { root } = await setup('/?sel=NYSE:NOPE');
    expect(root.querySelector('h2')?.textContent).toBe('Instrument not found');
    expect(root.textContent).toContain('The link may be outdated.');
  });

  it('closes by clearing the selection from the URL', async () => {
    const { root, router, settle } = await setup(`/?sel=${target.id}&q=a`);
    (root.querySelector('.dh-dialog__close') as HTMLButtonElement).click();
    await settle();
    expect(router.url).toBe('/?q=a');
    expect(root.querySelector('dialog')?.open).toBe(false);
  });
});
