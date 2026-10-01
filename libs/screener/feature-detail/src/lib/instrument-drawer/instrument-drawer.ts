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
  LocaleState,
  MarketDataPort,
  MarketDataStore,
  ScreenerUrlState,
  WatchlistStore,
} from '@data-heavy/data-access';
import { Button, Dialog, Skeleton } from '@data-heavy/ui';
import { getFormatters, type Instrument } from '@data-heavy/util';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PriceChart } from '../chart/price-chart';

export const CHART_RANGES = [
  { id: '1M', tradingDays: 21 },
  { id: '3M', tradingDays: 63 },
  { id: '6M', tradingDays: 126 },
  { id: '1Y', tradingDays: 252 },
] as const;

export type ChartRangeId = (typeof CHART_RANGES)[number]['id'];

interface Stat {
  /** Translation key. */
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
  imports: [Button, Dialog, PriceChart, Skeleton, TranslatePipe],
  templateUrl: './instrument-drawer.html',
  styleUrl: './instrument-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentDrawer {
  private readonly url = inject(ScreenerUrlState);
  private readonly market = inject(MarketDataStore);
  private readonly port = inject(MarketDataPort);
  protected readonly watchlist = inject(WatchlistStore);

  private readonly translate = inject(TranslateService);
  protected readonly locale = inject(LocaleState).locale;
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
    this.translate.currentLang();
    return this.translate.instant(
      this.notFound() ? 'detail.notFound' : 'detail.loading',
    ) as string;
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

  /** Labels are translation keys; values are formatted for the current locale. */
  protected readonly stats = computed<readonly Stat[]>(() => {
    const i = this.instrument();
    if (!i) {
      return [];
    }
    const locale = this.locale();
    const f = getFormatters(locale);
    const regions = new Intl.DisplayNames([locale], { type: 'region' });
    this.translate.currentLang();
    return [
      { label: 'detail.stats.price', value: f.price(i.price, i.currency) },
      {
        label: 'detail.stats.changeToday',
        value: f.signedPercent(i.changePct),
      },
      { label: 'detail.stats.marketCap', value: f.compactUsd(i.marketCapUsd) },
      { label: 'detail.stats.volume', value: f.compact(i.volume) },
      { label: 'detail.stats.peRatio', value: f.ratio(i.peRatio) },
      {
        label: 'detail.stats.dividendYield',
        value: f.percent(i.dividendYield),
      },
      { label: 'detail.stats.beta', value: f.ratio(i.beta) },
      {
        label: 'detail.stats.range52w',
        value: `${f.price(i.low52w, i.currency)} – ${f.price(i.high52w, i.currency)}`,
      },
      {
        label: 'detail.stats.type',
        value: this.translate.instant(`types.${i.type}`) as string,
      },
      { label: 'detail.stats.exchange', value: i.exchange },
      {
        label: 'detail.stats.country',
        value: regions.of(i.country) ?? i.country,
      },
      { label: 'detail.stats.currency', value: i.currency },
    ];
  });

  protected readonly tableRows = computed(() => {
    const i = this.instrument();
    const points = this.history.hasValue() ? this.history.value() : [];
    if (!i) {
      return [];
    }
    const f = getFormatters(this.locale());
    // Most recent first: the question is usually "what happened lately".
    return [...points].reverse().map((p) => ({
      date: f.date(p.date),
      close: f.price(p.close, i.currency),
    }));
  });

  protected readonly watched = computed(() => {
    const i = this.instrument();
    return !!i && this.watchlist.idSet().has(i.id);
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
