import type { PricePoint } from '@data-heavy/util';

import { buildChart, nearestIndex } from './chart-geometry';

const size = { width: 100, height: 50, padding: 5 };
const points: PricePoint[] = [
  { date: '2026-09-28', close: 10 },
  { date: '2026-09-29', close: 30 },
  { date: '2026-09-30', close: 20 },
];

describe('buildChart', () => {
  it('needs at least two points', () => {
    expect(buildChart([], size)).toBeNull();
    expect(buildChart(points.slice(0, 1), size)).toBeNull();
  });

  it('spreads points across the width and scales prices into the padded height', () => {
    const chart = buildChart(points, size);
    expect(chart?.xs).toEqual([0, 50, 100]);
    expect(chart?.y(10)).toBe(45); // lowest close at the bottom padding
    expect(chart?.y(30)).toBe(5); // highest close at the top padding
    expect(chart?.y(20)).toBe(25);
    expect(chart?.line).toBe('M0,45L50,5L100,25');
    expect(chart?.area).toBe('M0,45L50,5L100,25L100,50L0,50Z');
  });

  it('reports the first, last, minimum and maximum points', () => {
    const chart = buildChart(points, size);
    expect(chart?.first).toBe(points[0]);
    expect(chart?.last).toBe(points[2]);
    expect(chart?.min).toBe(points[0]);
    expect(chart?.max).toBe(points[1]);
  });

  it('draws a flat series as a centred line', () => {
    const flat = points.map((p) => ({ ...p, close: 7 }));
    const chart = buildChart(flat, size);
    expect(chart?.line).toBe('M0,25L50,25L100,25');
  });
});

describe('nearestIndex', () => {
  const xs = [0, 10, 20, 30];

  it('finds the closest x, preferring the right-hand point on a tie', () => {
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 4)).toBe(0);
    expect(nearestIndex(xs, 6)).toBe(1);
    expect(nearestIndex(xs, 15)).toBe(2);
    expect(nearestIndex(xs, 99)).toBe(3);
  });

  it('returns -1 when there are no points', () => {
    expect(nearestIndex([], 3)).toBe(-1);
  });
});
