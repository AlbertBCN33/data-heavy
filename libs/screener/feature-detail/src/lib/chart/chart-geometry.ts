import type { PricePoint } from '@data-heavy/util';

export interface ChartGeometry {
  /** SVG path for the price line, in viewBox units. */
  readonly line: string;
  /** Closed path for the shaded area under the line. */
  readonly area: string;
  readonly min: PricePoint;
  readonly max: PricePoint;
  readonly first: PricePoint;
  readonly last: PricePoint;
  /** x coordinate of each point, for hit-testing the pointer. */
  readonly xs: readonly number[];
  /** y coordinate of a price. */
  y(close: number): number;
}

export interface ChartSize {
  readonly width: number;
  readonly height: number;
  /** Vertical breathing room so the line never touches the edges. */
  readonly padding: number;
}

/**
 * Pure geometry for the price chart: maps points to SVG coordinates. Kept free of Angular and DOM
 * so the maths is unit-tested on its own. Returns `null` for fewer than two points (no line).
 */
export function buildChart(
  points: readonly PricePoint[],
  { width, height, padding }: ChartSize,
): ChartGeometry | null {
  if (points.length < 2) {
    return null;
  }
  let min = points[0] as PricePoint;
  let max = min;
  for (const point of points) {
    if (point.close < min.close) min = point;
    if (point.close > max.close) max = point;
  }
  const span = max.close - min.close || 1; // flat series: draw a centred line
  const top = padding;
  const bottom = height - padding;
  const y = (close: number) =>
    max.close === min.close
      ? height / 2
      : bottom - ((close - min.close) / span) * (bottom - top);
  const step = width / (points.length - 1);
  const xs = points.map((_, i) => round(i * step));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i]},${round(y(p.close))}`)
    .join('');
  const area = `${line}L${width},${height}L0,${height}Z`;

  return {
    line,
    area,
    min,
    max,
    first: points[0] as PricePoint,
    last: points[points.length - 1] as PricePoint,
    xs,
    y: (close) => round(y(close)),
  };
}

/** Index of the point closest to an x coordinate (binary search; xs are ascending). */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) {
    return -1;
  }
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] as number) < x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const prev = lo - 1;
  return prev >= 0 && x - (xs[prev] as number) < (xs[lo] as number) - x
    ? prev
    : lo;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
