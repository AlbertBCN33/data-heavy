import { getFormatters } from '@data-heavy/util';

import { summarizePrices } from './price-summary';

const en = getFormatters('en-US');

describe('summarizePrices', () => {
  it('describes direction, change and extremes', () => {
    const text = summarizePrices(
      [
        { date: '2026-09-28', close: 100 },
        { date: '2026-09-29', close: 130 },
        { date: '2026-09-30', close: 110 },
      ],
      'USD',
      en,
    );
    expect(text).toBe(
      'Up +10.00%, from $100.00 on Sep 28, 2026 to $110.00 on Sep 30, 2026. ' +
        'High $130.00 on Sep 29, 2026, low $100.00 on Sep 28, 2026.',
    );
  });

  it('describes falling and flat series', () => {
    const down = summarizePrices(
      [
        { date: '2026-09-29', close: 200 },
        { date: '2026-09-30', close: 150 },
      ],
      'EUR',
      en,
    );
    expect(down.startsWith('Down -25.00%')).toBe(true);

    const flat = summarizePrices(
      [
        { date: '2026-09-29', close: 0 },
        { date: '2026-09-30', close: 0 },
      ],
      'JPY',
      en,
    );
    expect(flat.startsWith('Unchanged 0.00%')).toBe(true);
  });

  it('handles an empty series', () => {
    expect(summarizePrices([], 'USD', en)).toBe('No price data.');
  });
});
