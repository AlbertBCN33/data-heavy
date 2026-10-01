import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  type Currency,
  getFormatters,
  type PricePoint,
} from '@data-heavy/util';

import { buildChart, nearestIndex } from './chart-geometry';
import { describePrices } from './price-summary';

/** viewBox size; the SVG stretches to its container with a fixed CSS height. */
const VIEW = { width: 600, height: 220, padding: 12 } as const;

/**
 * Lightweight SVG line chart for a price series (see ADR 0012 for why not a chart library).
 *
 * The SVG is decorative (`aria-hidden`): the figcaption carries a one-sentence summary, and the
 * drawer offers the full series as a data table. The pointer read-out (crosshair + tooltip) is a
 * mouse enhancement on top of those, not the only way to get values.
 */
@Component({
  selector: 'dh-price-chart',
  templateUrl: './price-chart.html',
  styleUrl: './price-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceChart {
  readonly points = input.required<readonly PricePoint[]>();
  readonly currency = input.required<Currency>();
  readonly locale = input('en-US');

  protected readonly view = VIEW;
  protected readonly geometry = computed(() => buildChart(this.points(), VIEW));
  private readonly format = computed(() => getFormatters(this.locale()));

  protected readonly trend = computed(() => {
    const g = this.geometry();
    return !g || g.last.close >= g.first.close ? 'up' : 'down';
  });

  private readonly translate = inject(TranslateService);

  /** Translated one-sentence text alternative for the chart. */
  protected readonly summary = computed(() => {
    this.translate.currentLang(); // re-translate on a language switch
    const summary = describePrices(
      this.points(),
      this.currency(),
      this.format(),
    );
    if (!summary) {
      return this.translate.instant('detail.chart.noData') as string;
    }
    return this.translate.instant('detail.chart.summary', {
      ...summary.params,
      direction: this.translate.instant(`detail.chart.${summary.direction}`),
    }) as string;
  });

  protected readonly labels = computed(() => {
    const g = this.geometry();
    if (!g) {
      return null;
    }
    const f = this.format();
    return {
      high: f.price(g.max.close, this.currency()),
      low: f.price(g.min.close, this.currency()),
      start: f.date(g.first.date),
      end: f.date(g.last.date),
    };
  });

  private readonly hoverIndex = signal<number | null>(null);

  /** Crosshair position and read-out for the hovered point. */
  protected readonly hover = computed(() => {
    const index = this.hoverIndex();
    const g = this.geometry();
    const point = index === null ? undefined : this.points()[index];
    if (index === null || !g || !point) {
      return null;
    }
    const x = g.xs[index] as number;
    return {
      x,
      y: g.y(point.close),
      percent: (x / VIEW.width) * 100,
      date: this.format().date(point.date),
      price: this.format().price(point.close, this.currency()),
    };
  });

  protected onPointerMove(event: PointerEvent): void {
    const g = this.geometry();
    const target = event.currentTarget as HTMLElement;
    if (!g || target.clientWidth === 0) {
      return;
    }
    const x = (event.offsetX / target.clientWidth) * VIEW.width;
    this.hoverIndex.set(nearestIndex(g.xs, x));
  }

  protected onPointerLeave(): void {
    this.hoverIndex.set(null);
  }
}
