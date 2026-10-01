import { generateInstruments } from './generate-instruments';
import {
  decodeSnapshot,
  encodeSnapshot,
  SnapshotFormatError,
} from './snapshot';

const rows = generateInstruments(5, 200);
const meta = { asOf: '2026-09-30', seed: 5 };

/** JSON round trip, as the snapshot would travel over the network. */
function wire(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(encodeSnapshot(rows, meta)));
}

function withColumn(name: string, values: unknown): Record<string, unknown> {
  const json = wire();
  (json['columns'] as Record<string, unknown>)[name] = values;
  return json;
}

describe('market snapshot codec', () => {
  it('round-trips instruments through JSON', () => {
    const decoded = decodeSnapshot(wire());
    expect(decoded.asOf).toBe('2026-09-30');
    expect(decoded.instruments).toEqual(rows);
  });

  it('dictionary-encodes enum columns', () => {
    const snapshot = encodeSnapshot(rows, meta);
    expect(snapshot.count).toBe(200);
    expect(snapshot.columns.exchange.every((v) => Number.isInteger(v))).toBe(
      true,
    );
  });

  it('decodes files whose dictionaries are ordered differently', () => {
    const json = wire();
    const dictionaries = json['dictionaries'] as Record<string, string[]>;
    const columns = json['columns'] as Record<string, number[]>;
    const original = dictionaries['type'] as string[];
    dictionaries['type'] = [...original].reverse();
    columns['type'] = (columns['type'] as number[]).map(
      (i) => original.length - 1 - i,
    );
    expect(decodeSnapshot(json).instruments).toEqual(rows);
  });

  it('rejects encoding unknown enum values', () => {
    const bad = [
      { ...(rows[0] as (typeof rows)[number]), sector: 'Crypto' as never },
    ];
    expect(() => encodeSnapshot(bad, meta)).toThrow(RangeError);
  });

  it.each([
    ['a non-object', null],
    ['an array', []],
    ['an unsupported version', { ...wire(), schemaVersion: 2 }],
    ['a bad date', { ...wire(), asOf: '30/09/2026' }],
    ['a negative count', { ...wire(), count: -1 }],
    ['missing columns', { ...wire(), columns: undefined }],
    [
      'a missing dictionary',
      {
        ...wire(),
        dictionaries: { ...(wire()['dictionaries'] as object), sector: 'x' },
      },
    ],
    [
      'an unknown dictionary value',
      {
        ...wire(),
        dictionaries: {
          ...(wire()['dictionaries'] as object),
          sector: ['Crypto'],
        },
      },
    ],
    ['a short column', withColumn('price', [1, 2, 3])],
    [
      'a non-finite number',
      withColumn(
        'price',
        rows.map((_, i) => (i === 3 ? 'NaN' : 1)),
      ),
    ],
    [
      'an out-of-range enum index',
      withColumn(
        'exchange',
        rows.map(() => 99),
      ),
    ],
    [
      'an empty symbol',
      withColumn(
        'symbol',
        rows.map(() => ''),
      ),
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => decodeSnapshot(input)).toThrow(SnapshotFormatError);
  });

  it('accepts null P/E ratios but not other non-numbers', () => {
    expect(() =>
      decodeSnapshot(
        withColumn(
          'peRatio',
          rows.map(() => null),
        ),
      ),
    ).not.toThrow();
    expect(() =>
      decodeSnapshot(
        withColumn(
          'peRatio',
          rows.map(() => '12'),
        ),
      ),
    ).toThrow(SnapshotFormatError);
  });
});
