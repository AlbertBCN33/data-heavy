import type { SortSpec } from '@data-heavy/util';

import { ariaSort, defaultDirection, nextSort } from './sorting';

describe('sorting', () => {
  it('starts numbers descending and text ascending', () => {
    expect(defaultDirection('price')).toBe('desc');
    expect(defaultDirection('name')).toBe('asc');
    expect(defaultDirection('sector')).toBe('asc');
  });

  describe('nextSort', () => {
    const price: SortSpec = { key: 'price', dir: 'desc' };
    const name: SortSpec = { key: 'name', dir: 'asc' };

    it('sorts by a new column only, in its default direction', () => {
      expect(nextSort([price], 'name', false)).toEqual([name]);
    });

    it('toggles the direction of the only sort column', () => {
      expect(nextSort([price], 'price', false)).toEqual([
        { key: 'price', dir: 'asc' },
      ]);
    });

    it('makes a secondary column the only sort key on plain activation', () => {
      expect(nextSort([price, name], 'name', false)).toEqual([name]);
    });

    it('appends a tie-breaker on additive activation', () => {
      expect(nextSort([price], 'name', true)).toEqual([price, name]);
    });

    it('toggles an existing key in place on additive activation', () => {
      expect(nextSort([price, name], 'name', true)).toEqual([
        price,
        { key: 'name', dir: 'desc' },
      ]);
    });

    it('replaces the last tie-breaker beyond the limit', () => {
      const three: SortSpec[] = [price, name, { key: 'beta', dir: 'desc' }];
      expect(nextSort(three, 'volume', true)).toEqual([
        price,
        name,
        { key: 'volume', dir: 'desc' },
      ]);
    });

    it('starts from an empty sort', () => {
      expect(nextSort([], 'symbol', true)).toEqual([
        { key: 'symbol', dir: 'asc' },
      ]);
    });
  });

  it('exposes aria-sort on the primary column only', () => {
    const sort: SortSpec[] = [
      { key: 'price', dir: 'asc' },
      { key: 'name', dir: 'desc' },
    ];
    expect(ariaSort(sort, 'price')).toBe('ascending');
    expect(ariaSort(sort, 'name')).toBeNull();
    expect(ariaSort([{ key: 'price', dir: 'desc' }], 'price')).toBe(
      'descending',
    );
    expect(ariaSort([], 'price')).toBeNull();
  });
});
