import {
  ASSET_TYPES,
  EXCHANGE_INFO,
  EXCHANGES,
  type Instrument,
  instrumentId,
  SECTORS,
} from './instrument';

/**
 * Wire format of the bundled market data. Columnar (one array per field) with enum fields
 * dictionary-encoded as indexes, so property names and repeated strings are not sent 10k times.
 * Country and currency are not sent: they follow from the exchange (see `EXCHANGE_INFO`).
 * `decodeSnapshot` validates everything: the file crosses a network boundary.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;

const DICTIONARIES = {
  type: ASSET_TYPES,
  exchange: EXCHANGES,
  sector: SECTORS,
} as const;

type EnumField = keyof typeof DICTIONARIES;
const ENUM_FIELDS = Object.keys(DICTIONARIES) as EnumField[];

const NUMBER_FIELDS = [
  'price',
  'changePct',
  'volume',
  'marketCapUsd',
  'dividendYield',
  'beta',
  'high52w',
  'low52w',
] as const;

export interface MarketSnapshot {
  readonly schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  /** Market date the data represents (ISO `YYYY-MM-DD`). */
  readonly asOf: string;
  readonly seed: number;
  readonly count: number;
  readonly dictionaries: { readonly [K in EnumField]: readonly string[] };
  readonly columns: {
    readonly symbol: readonly string[];
    readonly name: readonly string[];
    readonly peRatio: readonly (number | null)[];
  } & { readonly [K in EnumField]: readonly number[] } & {
    readonly [K in (typeof NUMBER_FIELDS)[number]]: readonly number[];
  };
}

export interface SnapshotMeta {
  readonly asOf: string;
  readonly seed: number;
}

export class SnapshotFormatError extends Error {
  constructor(message: string) {
    super(`Invalid market snapshot: ${message}`);
    this.name = 'SnapshotFormatError';
  }
}

export function encodeSnapshot(
  rows: readonly Instrument[],
  meta: SnapshotMeta,
): MarketSnapshot {
  const enumIndex = (field: EnumField, value: string): number => {
    const index = (DICTIONARIES[field] as readonly string[]).indexOf(value);
    if (index < 0) {
      throw new RangeError(`Unknown ${field} "${value}"`);
    }
    return index;
  };
  const enumColumn = (field: EnumField) =>
    rows.map((r) => enumIndex(field, r[field]));
  const numberColumn = (field: (typeof NUMBER_FIELDS)[number]) =>
    rows.map((r) => r[field]);

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    asOf: meta.asOf,
    seed: meta.seed,
    count: rows.length,
    dictionaries: DICTIONARIES,
    columns: {
      symbol: rows.map((r) => r.symbol),
      name: rows.map((r) => r.name),
      peRatio: rows.map((r) => r.peRatio),
      type: enumColumn('type'),
      exchange: enumColumn('exchange'),
      sector: enumColumn('sector'),
      price: numberColumn('price'),
      changePct: numberColumn('changePct'),
      volume: numberColumn('volume'),
      marketCapUsd: numberColumn('marketCapUsd'),
      dividendYield: numberColumn('dividendYield'),
      beta: numberColumn('beta'),
      high52w: numberColumn('high52w'),
      low52w: numberColumn('low52w'),
    },
  };
}

export interface DecodedSnapshot {
  readonly asOf: string;
  readonly instruments: Instrument[];
}

export function decodeSnapshot(input: unknown): DecodedSnapshot {
  if (!isRecord(input)) {
    throw new SnapshotFormatError('expected an object');
  }
  if (input['schemaVersion'] !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotFormatError(
      `unsupported schemaVersion ${String(input['schemaVersion'])}`,
    );
  }
  const asOf = input['asOf'];
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new SnapshotFormatError('asOf must be an ISO date');
  }
  const count = input['count'];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new SnapshotFormatError('count must be a non-negative integer');
  }
  const dictionaries = input['dictionaries'];
  const columns = input['columns'];
  if (!isRecord(dictionaries) || !isRecord(columns)) {
    throw new SnapshotFormatError('missing dictionaries or columns');
  }

  // Dictionaries in the file are resolved against the known enum values, so a file written by
  // a newer generator with reordered or extra values still decodes, and unknown values fail.
  const resolvers = {} as Record<EnumField, readonly string[]>;
  for (const field of ENUM_FIELDS) {
    const dict = dictionaries[field];
    if (!Array.isArray(dict)) {
      throw new SnapshotFormatError(`dictionary "${field}" must be an array`);
    }
    const known = DICTIONARIES[field] as readonly string[];
    resolvers[field] = dict.map((value) => {
      if (typeof value !== 'string' || !known.includes(value)) {
        throw new SnapshotFormatError(`unknown ${field} "${String(value)}"`);
      }
      return value;
    });
  }

  const column = <T>(
    name: string,
    check: (v: unknown) => v is T,
  ): readonly T[] => {
    const values = columns[name];
    if (!Array.isArray(values) || values.length !== count) {
      throw new SnapshotFormatError(
        `column "${name}" must have ${count} values`,
      );
    }
    values.forEach((v, i) => {
      if (!check(v)) {
        throw new SnapshotFormatError(
          `column "${name}" has an invalid value at row ${i}`,
        );
      }
    });
    return values as T[];
  };

  const symbol = column('symbol', isNonEmptyString);
  const name = column('name', isNonEmptyString);
  const peRatio = column('peRatio', isNullableFiniteNumber);
  const enums = {} as Record<EnumField, readonly number[]>;
  for (const field of ENUM_FIELDS) {
    const size = (resolvers[field] as readonly string[]).length;
    enums[field] = column(field, (v): v is number => isIndex(v, size));
  }
  const nums = {} as Record<(typeof NUMBER_FIELDS)[number], readonly number[]>;
  for (const field of NUMBER_FIELDS) {
    nums[field] = column(field, isFiniteNumber);
  }

  const enumValue = <F extends EnumField>(field: F, row: number) =>
    resolvers[field][
      enums[field][row] as number
    ] as (typeof DICTIONARIES)[F][number];

  const instruments = new Array<Instrument>(count);
  for (let i = 0; i < count; i++) {
    const exchange = enumValue('exchange', i);
    const sym = symbol[i] as string;
    instruments[i] = {
      id: instrumentId(exchange, sym),
      symbol: sym,
      name: name[i] as string,
      type: enumValue('type', i),
      exchange,
      ...EXCHANGE_INFO[exchange],
      sector: enumValue('sector', i),
      price: nums.price[i] as number,
      changePct: nums.changePct[i] as number,
      volume: nums.volume[i] as number,
      marketCapUsd: nums.marketCapUsd[i] as number,
      peRatio: peRatio[i] as number | null,
      dividendYield: nums.dividendYield[i] as number,
      beta: nums.beta[i] as number,
      high52w: nums.high52w[i] as number,
      low52w: nums.low52w[i] as number,
    };
  }
  return { asOf, instruments };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isIndex(value: unknown, size: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < size
  );
}
