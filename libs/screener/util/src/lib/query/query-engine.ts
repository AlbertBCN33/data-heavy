import {
  COLUMNS,
  type ColumnKey,
  type EnumColumnKey,
  type NumberColumnKey,
} from '../market/columns';
import type { Instrument } from '../market/instrument';
import type { RangeFilter, ScreenerQuery, SortSpec } from './screener-query';

/**
 * Filter and sort engine over an in-memory dataset. Built once per dataset (it pre-computes
 * typed numeric columns and lower-cased search text), then answers queries with the matching
 * row indexes in display order. Returning indexes keeps results cheap to transfer from a Web
 * Worker and lets the table read rows from its own copy of the dataset.
 *
 * Pure and synchronous: it runs the same way on the main thread, in a worker, or in tests.
 */
export interface QueryEngine {
  readonly size: number;
  run(query: ScreenerQuery): Uint32Array;
}

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});

export function createQueryEngine(rows: readonly Instrument[]): QueryEngine {
  const size = rows.length;
  const symbols = rows.map((r) => r.symbol.toLowerCase());
  const names = rows.map((r) => r.name.toLowerCase());

  // NaN marks a missing value (peRatio null); it never matches a range and sorts last.
  const numeric = new Map<NumberColumnKey, Float64Array>();
  const text = new Map<ColumnKey, readonly string[]>();
  for (const column of COLUMNS) {
    if (column.kind === 'number') {
      const values = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        const v = (rows[i] as Instrument)[column.key];
        values[i] = v === null ? Number.NaN : v;
      }
      numeric.set(column.key, values);
    } else {
      text.set(
        column.key,
        rows.map((r) => r[column.key]),
      );
    }
  }

  const run = (query: ScreenerQuery): Uint32Array => {
    const matches = filterIndexes(query);
    return sortIndexes(matches, query.sort);
  };

  const filterIndexes = (query: ScreenerQuery): Uint32Array => {
    const needle = query.text.trim().toLowerCase();
    const ranges = activeRanges(query.ranges);
    const selects = activeSelects(query.selects);

    const out = new Uint32Array(size);
    let count = 0;
    rows: for (let i = 0; i < size; i++) {
      if (
        needle &&
        !(symbols[i] as string).startsWith(needle) &&
        !(names[i] as string).includes(needle)
      ) {
        continue;
      }
      for (const [key, { min, max }] of ranges) {
        const v = (numeric.get(key) as Float64Array)[i] as number;
        // NaN fails both comparisons, so missing values are excluded by any active range.
        if (!(v >= min && v <= max)) {
          continue rows;
        }
      }
      for (const [key, allowed] of selects) {
        if (!allowed.has((text.get(key) as readonly string[])[i] as string)) {
          continue rows;
        }
      }
      out[count++] = i;
    }
    return out.slice(0, count);
  };

  const sortIndexes = (
    indexes: Uint32Array,
    sort: readonly SortSpec[],
  ): Uint32Array => {
    if (sort.length === 0) {
      return indexes;
    }
    const comparators = sort.map(({ key, dir }) => {
      const sign = dir === 'asc' ? 1 : -1;
      const values = numeric.get(key as NumberColumnKey);
      if (values) {
        return (a: number, b: number): number => {
          const va = values[a] as number;
          const vb = values[b] as number;
          const aMissing = Number.isNaN(va);
          const bMissing = Number.isNaN(vb);
          // Missing values go last regardless of direction.
          if (aMissing || bMissing) {
            return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
          }
          return sign * (va - vb);
        };
      }
      const strings = text.get(key) as readonly string[];
      return (a: number, b: number): number =>
        sign * collator.compare(strings[a] as string, strings[b] as string);
    });

    // TypedArray#sort is not guaranteed stable across engines, so ties fall back to the
    // original row order explicitly.
    return indexes.sort((a, b) => {
      for (const compare of comparators) {
        const result = compare(a, b);
        if (result !== 0) {
          return result;
        }
      }
      return a - b;
    });
  };

  return { size, run };
}

function activeRanges(
  ranges: ScreenerQuery['ranges'],
): [NumberColumnKey, { min: number; max: number }][] {
  const active: [NumberColumnKey, { min: number; max: number }][] = [];
  for (const [key, range] of Object.entries(ranges) as [
    NumberColumnKey,
    RangeFilter | undefined,
  ][]) {
    if (!range || (range.min === undefined && range.max === undefined)) {
      continue;
    }
    active.push([
      key,
      { min: range.min ?? -Infinity, max: range.max ?? Infinity },
    ]);
  }
  return active;
}

function activeSelects(
  selects: ScreenerQuery['selects'],
): [EnumColumnKey, ReadonlySet<string>][] {
  const active: [EnumColumnKey, ReadonlySet<string>][] = [];
  for (const [key, values] of Object.entries(selects) as [
    EnumColumnKey,
    readonly string[] | undefined,
  ][]) {
    if (values && values.length > 0) {
      active.push([key, new Set(values)]);
    }
  }
  return active;
}
