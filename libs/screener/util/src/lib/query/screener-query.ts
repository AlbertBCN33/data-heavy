import {
  type ColumnKey,
  DEFAULT_COLUMNS,
  type EnumColumnKey,
  type NumberColumnKey,
} from '../market/columns';

/** Inclusive numeric range; a missing bound is open. */
export interface RangeFilter {
  readonly min?: number;
  readonly max?: number;
}

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  readonly key: ColumnKey;
  readonly dir: SortDirection;
}

/** Everything that decides which rows are shown and in which order. */
export interface ScreenerQuery {
  /** Case-insensitive search on symbol (prefix) and name (substring). */
  readonly text: string;
  readonly ranges: Readonly<Partial<Record<NumberColumnKey, RangeFilter>>>;
  /** Allowed values per enum column; a missing or empty list means "any". */
  readonly selects: Readonly<Partial<Record<EnumColumnKey, readonly string[]>>>;
  /** Sort keys in priority order. */
  readonly sort: readonly SortSpec[];
}

/** The full shareable view: the query plus presentation state. Encoded in the URL. */
export interface ScreenerView extends ScreenerQuery {
  /** Visible columns in display order. */
  readonly columns: readonly ColumnKey[];
  /** Id of the instrument open in the detail drawer. */
  readonly selected: string | null;
}

export const MAX_SORT_KEYS = 3;
export const MAX_TEXT_LENGTH = 64;

export const DEFAULT_SORT: readonly SortSpec[] = [
  { key: 'marketCapUsd', dir: 'desc' },
];

export const DEFAULT_VIEW: ScreenerView = {
  text: '',
  ranges: {},
  selects: {},
  sort: DEFAULT_SORT,
  columns: DEFAULT_COLUMNS,
  selected: null,
};

export function toQuery({
  text,
  ranges,
  selects,
  sort,
}: ScreenerView): ScreenerQuery {
  return { text, ranges, selects, sort };
}
