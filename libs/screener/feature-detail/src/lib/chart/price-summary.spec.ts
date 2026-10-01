import { getFormatters } from '@data-heavy/util';

import { describePrices } from './price-summary';

const en = getFormatters('en-US');
const es = getFormatters('es-ES');

describe('describePrices', () => {
  const points = [
    { date: '2026-09-28', close: 100 },
    { date: '2026-09-29', close: 130 },
    { date: '2026-09-30', close: 110 },
  ];

  it('describes direction, change and extremes as formatted values', () => {
    expect(describePrices(points, 'USD', en)).toEqual({
      direction: 'up',
      params: {
        change: '+10.00%',
        start: '$100.00',
        startDate: 'Sep 28, 2026',
        end: '$110.00',
        endDate: 'Sep 30, 2026',
        high: '$130.00',
        highDate: 'Sep 29, 2026',
        low: '$100.00',
        lowDate: 'Sep 28, 2026',
      },
    });
  });

  it('formats for the given locale', () => {
    const summary = describePrices(points, 'EUR', es);
    expect(summary?.params.startDate).toBe('28 sept 2026');
    expect(summary?.params.change.replace(/\s/g, ' ')).toBe('+10,00 %');
  });

  it('classifies falling and flat series', () => {
    expect(
      describePrices(
        [
          { date: '2026-09-29', close: 200 },
          { date: '2026-09-30', close: 150 },
        ],
        'EUR',
        en,
      )?.direction,
    ).toBe('down');
    expect(
      describePrices(
        [
          { date: '2026-09-29', close: 0 },
          { date: '2026-09-30', close: 0 },
        ],
        'JPY',
        en,
      )?.direction,
    ).toBe('flat');
  });

  it('returns null for an empty series', () => {
    expect(describePrices([], 'USD', en)).toBeNull();
  });
});
