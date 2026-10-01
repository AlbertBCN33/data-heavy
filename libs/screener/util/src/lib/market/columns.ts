import {
  ASSET_TYPES,
  COUNTRIES,
  EXCHANGES,
  type Instrument,
  SECTORS,
} from './instrument';

/**
 * Column registry: the single source of truth for what can be shown, sorted and filtered.
 * The table, the filter panel and the URL codec all derive their behaviour from it.
 */

export type ColumnFormat =
  | 'text'
  | 'price'
  | 'percent'
  | 'signedPercent'
  | 'compactUsd'
  | 'compact'
  | 'ratio';

interface ColumnBase<K extends keyof Instrument> {
  readonly key: K;
  readonly format: ColumnFormat;
  readonly align: 'start' | 'end';
  readonly defaultVisible: boolean;
}

export interface TextColumn<K extends keyof Instrument = keyof Instrument>
  extends ColumnBase<K> {
  readonly kind: 'text';
}

export interface EnumColumn<K extends keyof Instrument = keyof Instrument>
  extends ColumnBase<K> {
  readonly kind: 'enum';
  readonly options: readonly string[];
}

export interface NumberColumn<K extends keyof Instrument = keyof Instrument>
  extends ColumnBase<K> {
  readonly kind: 'number';
}

export type ColumnDef = TextColumn | EnumColumn | NumberColumn;

export const COLUMNS = [
  text('symbol', true),
  text('name', true),
  enumeration('type', ASSET_TYPES, false),
  enumeration('exchange', EXCHANGES, true),
  enumeration('sector', SECTORS, true),
  enumeration('country', COUNTRIES, false),
  number('price', 'price', true),
  number('changePct', 'signedPercent', true),
  number('volume', 'compact', true),
  number('marketCapUsd', 'compactUsd', true),
  number('peRatio', 'ratio', true),
  number('dividendYield', 'percent', false),
  number('beta', 'ratio', false),
  number('high52w', 'price', false),
  number('low52w', 'price', false),
] as const satisfies readonly ColumnDef[];

export type ColumnKey = (typeof COLUMNS)[number]['key'];
export type NumberColumnKey = Extract<
  (typeof COLUMNS)[number],
  { kind: 'number' }
>['key'];
export type EnumColumnKey = Extract<
  (typeof COLUMNS)[number],
  { kind: 'enum' }
>['key'];

/** The row header column; always visible and always first. */
export const PINNED_COLUMN: ColumnKey = 'symbol';

export const COLUMN_KEYS: readonly ColumnKey[] = COLUMNS.map((c) => c.key);

export const DEFAULT_COLUMNS: readonly ColumnKey[] = COLUMNS.filter(
  (c) => c.defaultVisible,
).map((c) => c.key);

const BY_KEY = new Map<string, ColumnDef>(COLUMNS.map((c) => [c.key, c]));

export function getColumn(key: string): ColumnDef | undefined {
  return BY_KEY.get(key);
}

export function isColumnKey(key: string): key is ColumnKey {
  return BY_KEY.has(key);
}

export function isNumberColumnKey(key: string): key is NumberColumnKey {
  return BY_KEY.get(key)?.kind === 'number';
}

export function isEnumColumnKey(key: string): key is EnumColumnKey {
  return BY_KEY.get(key)?.kind === 'enum';
}

function text<K extends keyof Instrument>(
  key: K,
  defaultVisible: boolean,
): TextColumn<K> {
  return { key, kind: 'text', format: 'text', align: 'start', defaultVisible };
}

function enumeration<K extends keyof Instrument>(
  key: K,
  options: readonly string[],
  defaultVisible: boolean,
): EnumColumn<K> {
  return {
    key,
    kind: 'enum',
    options,
    format: 'text',
    align: 'start',
    defaultVisible,
  };
}

function number<K extends keyof Instrument>(
  key: K,
  format: ColumnFormat,
  defaultVisible: boolean,
): NumberColumn<K> {
  return { key, kind: 'number', format, align: 'end', defaultVisible };
}
