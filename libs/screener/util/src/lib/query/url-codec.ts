import {
  COLUMNS,
  type ColumnKey,
  DEFAULT_COLUMNS,
  type EnumColumn,
  type EnumColumnKey,
  getColumn,
  isColumnKey,
  isEnumColumnKey,
  isNumberColumnKey,
  type NumberColumnKey,
  PINNED_COLUMN,
} from '../market/columns';
import { INSTRUMENT_ID_PATTERN } from '../market/instrument';
import {
  DEFAULT_SORT,
  DEFAULT_VIEW,
  MAX_SORT_KEYS,
  MAX_TEXT_LENGTH,
  type RangeFilter,
  type ScreenerView,
  type SortSpec,
} from './screener-query';

/**
 * Two-way mapping between a {@link ScreenerView} and URL query parameters.
 *
 * Format (all optional; defaults are omitted so URLs stay short and canonical):
 *
 * | Param            | Example                         | Meaning                                    |
 * | ---------------- | ------------------------------- | ------------------------------------------ |
 * | `q`              | `q=bank`                        | Text search                                |
 * | `<number col>`   | `price=10..200`, `peRatio=..15` | Inclusive range, either bound optional     |
 * | `<enum col>`     | `sector=Energy,Utilities`       | Allowed values                             |
 * | `sort`           | `sort=-changePct,symbol`        | Up to 3 keys, `-` prefix = descending      |
 * | `cols`           | `cols=symbol,name,price`        | Visible columns in order (symbol pinned)   |
 * | `sel`            | `sel=NASDAQ:ABC`                | Instrument open in the detail drawer       |
 *
 * Decoding never throws. Each invalid parameter is dropped on its own, reported in `issues`, and
 * the rest of the view is kept, so a hand-edited or outdated link still opens something useful.
 */

export type QueryParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export interface CodecIssue {
  readonly param: string;
  readonly reason:
    | 'unknown-param'
    | 'invalid-range'
    | 'unknown-value'
    | 'unknown-column'
    | 'duplicate'
    | 'too-many'
    | 'invalid-id'
    | 'too-long';
}

export interface DecodeResult {
  readonly view: ScreenerView;
  readonly issues: readonly CodecIssue[];
}

const RESERVED = new Set(['q', 'sort', 'cols', 'sel']);

/**
 * Params owned by other parts of the app (language, stress mode, …). The codec ignores them
 * instead of reporting them as unknown.
 */
const FOREIGN_PARAMS = new Set(['lang', 'rows', 'sim']);

export function decodeView(params: QueryParams): DecodeResult {
  const issues: CodecIssue[] = [];
  const ranges: Partial<Record<NumberColumnKey, RangeFilter>> = {};
  const selects: Partial<Record<EnumColumnKey, readonly string[]>> = {};
  let text = DEFAULT_VIEW.text;
  let sort = DEFAULT_VIEW.sort;
  let columns = DEFAULT_VIEW.columns;
  let selected = DEFAULT_VIEW.selected;

  for (const [param, raw] of Object.entries(params)) {
    // Repeated params (`?q=a&q=b`): the last one wins, like most routers.
    const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    if (value === undefined || FOREIGN_PARAMS.has(param)) {
      continue;
    }
    if (param === 'q') {
      const trimmed = value.trim();
      if (trimmed.length > MAX_TEXT_LENGTH) {
        issues.push({ param, reason: 'too-long' });
      } else {
        text = trimmed;
      }
    } else if (param === 'sort') {
      sort = decodeSort(value, issues);
    } else if (param === 'cols') {
      columns = decodeColumns(value, issues);
    } else if (param === 'sel') {
      if (INSTRUMENT_ID_PATTERN.test(value)) {
        selected = value;
      } else {
        issues.push({ param, reason: 'invalid-id' });
      }
    } else {
      if (isNumberColumnKey(param)) {
        const range = parseRange(value);
        if (range) {
          ranges[param] = range;
        } else {
          issues.push({ param, reason: 'invalid-range' });
        }
      } else if (isEnumColumnKey(param)) {
        const options = (getColumn(param) as EnumColumn).options;
        const values = decodeSelect(param, value, options, issues);
        if (values.length > 0) {
          selects[param] = values;
        }
      } else {
        issues.push({ param, reason: 'unknown-param' });
      }
    }
  }

  return { view: { text, ranges, selects, sort, columns, selected }, issues };
}

/** Encodes only non-default values, in a stable order, so equal views produce equal URLs. */
export function encodeView(view: ScreenerView): Record<string, string> {
  const params: Record<string, string> = {};
  if (view.text.trim()) {
    params['q'] = view.text.trim();
  }
  for (const column of COLUMNS) {
    if (column.kind === 'number') {
      const range = view.ranges[column.key];
      if (range && (range.min !== undefined || range.max !== undefined)) {
        params[column.key] =
          `${formatBound(range.min)}..${formatBound(range.max)}`;
      }
    } else if (column.kind === 'enum') {
      const values = view.selects[column.key];
      if (values && values.length > 0) {
        // Canonical order: as declared in the column options.
        params[column.key] = column.options
          .filter((o) => values.includes(o))
          .join(',');
      }
    }
  }
  if (!sameSort(view.sort, DEFAULT_SORT)) {
    params['sort'] = view.sort
      .map((s) => (s.dir === 'desc' ? `-${s.key}` : s.key))
      .join(',');
  }
  if (!sameList(view.columns, DEFAULT_COLUMNS)) {
    params['cols'] = view.columns.join(',');
  }
  if (view.selected) {
    params['sel'] = view.selected;
  }
  return params;
}

/** Parses `min..max`; either side may be empty. Returns `null` for anything else. */
export function parseRange(value: string): RangeFilter | null {
  // Split on the first `..`; decimals use a single dot, so `1.5..2.5` splits correctly and
  // anything with a second `..` ends up as an invalid bound.
  const separator = value.indexOf('..');
  if (separator < 0) {
    return null;
  }
  const min = parseBound(value.slice(0, separator));
  const max = parseBound(value.slice(separator + 2));
  if (min === null || max === null) {
    return null;
  }
  if (min === undefined && max === undefined) {
    return null;
  }
  if (min !== undefined && max !== undefined && min > max) {
    return null;
  }
  return {
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
  };
}

const SUFFIXES: Readonly<Record<string, number>> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
};

/** `undefined` = open bound, `null` = invalid. Accepts `1500`, `-2.5`, `1e9`, `2.5B`, `300k`. */
function parseBound(raw: string): number | undefined | null {
  const value = raw.trim();
  if (value === '') {
    return undefined;
  }
  const match = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)([kmbt])?$/i.exec(value);
  if (!match) {
    return null;
  }
  const n =
    Number(match[1]) *
    (match[2] ? (SUFFIXES[match[2].toLowerCase()] as number) : 1);
  return Number.isFinite(n) ? n : null;
}

function formatBound(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function decodeSort(value: string, issues: CodecIssue[]): readonly SortSpec[] {
  const sort: SortSpec[] = [];
  for (const token of splitList(value)) {
    const desc = token.startsWith('-');
    const key = desc ? token.slice(1) : token;
    if (!isColumnKey(key)) {
      issues.push({ param: 'sort', reason: 'unknown-column' });
    } else if (sort.some((s) => s.key === key)) {
      issues.push({ param: 'sort', reason: 'duplicate' });
    } else if (sort.length >= MAX_SORT_KEYS) {
      issues.push({ param: 'sort', reason: 'too-many' });
    } else {
      sort.push({ key, dir: desc ? 'desc' : 'asc' });
    }
  }
  // `sort=` (explicitly empty) means "no sorting"; only garbage falls back to the default.
  return sort.length > 0 || value.trim() === '' ? sort : DEFAULT_SORT;
}

function decodeColumns(
  value: string,
  issues: CodecIssue[],
): readonly ColumnKey[] {
  const columns: ColumnKey[] = [PINNED_COLUMN];
  for (const key of splitList(value)) {
    if (!isColumnKey(key)) {
      issues.push({ param: 'cols', reason: 'unknown-column' });
    } else if (key !== PINNED_COLUMN && !columns.includes(key)) {
      columns.push(key);
    }
  }
  return columns.length > 1 ? columns : DEFAULT_COLUMNS;
}

function decodeSelect(
  param: string,
  value: string,
  options: readonly string[],
  issues: CodecIssue[],
): string[] {
  const values: string[] = [];
  for (const item of splitList(value)) {
    if (!options.includes(item)) {
      issues.push({ param, reason: 'unknown-value' });
    } else if (!values.includes(item)) {
      values.push(item);
    }
  }
  return values;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sameSort(a: readonly SortSpec[], b: readonly SortSpec[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.key === b[i]?.key && s.dir === b[i]?.dir)
  );
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Exposed for the router integration: params this codec owns. */
export function isViewParam(param: string): boolean {
  return RESERVED.has(param) || isColumnKey(param);
}
