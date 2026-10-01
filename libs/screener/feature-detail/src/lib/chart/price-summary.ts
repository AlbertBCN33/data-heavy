import type { Currency, Formatters, PricePoint } from '@data-heavy/util';

export interface PriceSummary {
  readonly direction: 'up' | 'down' | 'flat';
  /** Formatted values for the translated summary sentence. */
  readonly params: {
    readonly change: string;
    readonly start: string;
    readonly startDate: string;
    readonly end: string;
    readonly endDate: string;
    readonly high: string;
    readonly highDate: string;
    readonly low: string;
    readonly lowDate: string;
  };
}

/**
 * What a sighted user takes away from the chart at a glance (direction, change, extremes), as
 * locale-formatted values. The component turns it into a translated sentence: the chart's text
 * alternative (WCAG 1.1.1). Returns `null` for an empty series.
 */
export function describePrices(
  points: readonly PricePoint[],
  currency: Currency,
  format: Formatters,
): PriceSummary | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return null;
  }
  let high = first;
  let low = first;
  for (const p of points) {
    if (p.close > high.close) high = p;
    if (p.close < low.close) low = p;
  }
  const change =
    first.close === 0 ? 0 : ((last.close - first.close) / first.close) * 100;
  const price = (p: PricePoint) => format.price(p.close, currency);

  return {
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    params: {
      change: format.signedPercent(change),
      start: price(first),
      startDate: format.date(first.date),
      end: price(last),
      endDate: format.date(last.date),
      high: price(high),
      highDate: format.date(high.date),
      low: price(low),
      lowDate: format.date(low.date),
    },
  };
}
