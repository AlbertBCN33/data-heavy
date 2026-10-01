import type { Currency, Formatters, PricePoint } from '@data-heavy/util';

/**
 * One-sentence text alternative for the chart (WCAG 1.1.1): what a sighted user takes away at a
 * glance (direction, change, extremes). The full series is available as a data table.
 */
export function summarizePrices(
  points: readonly PricePoint[],
  currency: Currency,
  format: Formatters,
): string {
  if (points.length === 0) {
    return 'No price data.';
  }
  const first = points[0] as PricePoint;
  const last = points[points.length - 1] as PricePoint;
  let high = first;
  let low = first;
  for (const p of points) {
    if (p.close > high.close) high = p;
    if (p.close < low.close) low = p;
  }
  const price = (p: PricePoint) => format.price(p.close, currency);
  const change =
    first.close === 0 ? 0 : ((last.close - first.close) / first.close) * 100;
  const direction = change > 0 ? 'Up' : change < 0 ? 'Down' : 'Unchanged';

  return (
    `${direction} ${format.signedPercent(change)}, from ${price(first)} on ${format.date(first.date)} ` +
    `to ${price(last)} on ${format.date(last.date)}. ` +
    `High ${price(high)} on ${format.date(high.date)}, low ${price(low)} on ${format.date(low.date)}.`
  );
}
