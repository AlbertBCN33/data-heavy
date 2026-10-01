import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import {
  isMarketDataError,
  MarketDataPort,
  MarketDataStore,
  ScreenerUrlState,
} from '@data-heavy/data-access';
import { Button, Dialog, Skeleton } from '@data-heavy/ui';
import { getFormatters, type Instrument } from '@data-heavy/util';

import { PriceChart } from '../chart/price-chart';

export const CHART_RANGES = [
  { id: '1M', label: '1 month', tradingDays: 21 },
  { id: '3M', label: '3 months', tradingDays: 63 },
  { id: '6M', label: '6 months', tradingDays: 126 },
  { id: '1Y', label: '1 year', tradingDays: 252 },
] as const;

export type ChartRangeId = (typeof CHART_RANGES)[number]['id'];

interface Stat {
  readonly label: string;
  readonly value: string;
}

/**
 * Detail drawer for the instrument selected in the URL (`sel=`). Opening and closing go through
 * the URL, so a shared link opens the drawer and Back closes it.
 *
 * Loaded with `@defer` by the app when something is selected, so this component and the chart
 * are not part of the screener's bundle.
 */
@Component({
  selector: 'dh-instrument-drawer',
  imports: [Button, Dialog, PriceChart, Skeleton],
  templateUrl: './instrument-drawer.html',
  styleUrl: './instrument-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentDrawer {
  private readonly url = inject(ScreenerUrlState);
  private readonly market = inject(MarketDataStore);
  private readonly port = inject(MarketDataPort);

  protected readonly locale = 'en-US';
  protected readonly ranges = CHART_RANGES;
  protected readonly range = signal<ChartRangeId>('1Y');
  protected readonly showTable = signal(false);

  protected readonly selectedId = computed(() => this.url.view().selected);
  protected readonly open = computed(() => this.selectedId() !== null);
  protected readonly instrument = computed<Instrument | null>(() => {
    const id = this.selectedId();
    return id ? (this.market.byId().get(id) ?? null) : null;
  });
  /** Data loaded, but the id in the link does not exist (e.g. an outdated link). */
  protected readonly notFound = computed(
    () => this.open() && this.market.status() === 'ready' && !this.instrument(),
  );

  protected readonly title = computed(() => {
    const i = this.instrument();
    if (i) {
      return `${i.symbol} · ${i.name}`;
    }
    return this.notFound() ? 'Instrument not found' : 'Loading instrument';
  });

  protected readonly history = resource({
    params: () => {
      const instrument = this.instrument();
      const range = CHART_RANGES.find((r) => r.id === this.range());
      return instrument && range
        ? { id: instrument.id, days: range.tradingDays }
        : undefined;
    },
    loader: ({ params, abortSignal }) =>
      this.port.getPriceHistory(params.id, params.days, abortSignal),
  });

  protected readonly historyRetryable = computed(() => {
    const error = this.history.error();
    return !isMarketDataError(error) || error.retryable;
  });

  protected readonly stats = computed<readonly Stat[]>(() => {
    const i = this.instrument();
    if (!i) {
      return [];
    }
    const f = getFormatters(this.locale);
    const regions = new Intl.DisplayNames([this.locale], { type: 'region' });
    return [
      { label: 'Price', value: f.price(i.price, i.currency) },
      { label: 'Change today', value: f.signedPercent(i.changePct) },
      { label: 'Market cap', value: f.compactUsd(i.marketCapUsd) },
      { label: 'Volume', value: f.compact(i.volume) },
      { label: 'P/E ratio', value: f.ratio(i.peRatio) },
      { label: 'Dividend yield', value: f.percent(i.dividendYield) },
      { label: 'Beta', value: f.ratio(i.beta) },
      {
        label: '52-week range',
        value: `${f.price(i.low52w, i.currency)} – ${f.price(i.high52w, i.currency)}`,
      },
      { label: 'Type', value: i.type === 'etf' ? 'ETF' : 'Equity' },
      { label: 'Exchange', value: i.exchange },
      { label: 'Country', value: regions.of(i.country) ?? i.country },
      { label: 'Currency', value: i.currency },
    ];
  });

  protected readonly tableRows = computed(() => {
    const i = this.instrument();
    const points = this.history.hasValue() ? this.history.value() : [];
    if (!i) {
      return [];
    }
    const f = getFormatters(this.locale);
    // Most recent first: the question is usually "what happened lately".
    return [...points].reverse().map((p) => ({
      date: f.date(p.date),
      close: f.price(p.close, i.currency),
    }));
  });

  protected onOpenChange(open: boolean): void {
    if (!open) {
      this.url.update({ selected: null });
    }
  }

  protected selectRange(id: ChartRangeId): void {
    this.range.set(id);
  }
}
