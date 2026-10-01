import type { Instrument } from '../market/instrument';
import { createQueryEngine } from './query-engine';
import type { ScreenerQuery } from './screener-query';

function row(
  overrides: Partial<Instrument> & Pick<Instrument, 'symbol'>,
): Instrument {
  return {
    id: `NYSE:${overrides.symbol}`,
    name: `${overrides.symbol} Inc.`,
    type: 'equity',
    exchange: 'NYSE',
    country: 'US',
    currency: 'USD',
    sector: 'Technology',
    price: 10,
    changePct: 0,
    volume: 1000,
    marketCapUsd: 1e9,
    peRatio: 15,
    dividendYield: 0,
    beta: 1,
    high52w: 12,
    low52w: 8,
    ...overrides,
  };
}

const rows: Instrument[] = [
  row({
    symbol: 'ALFA',
    name: 'Alfa Bank plc',
    sector: 'Financials',
    price: 50,
    peRatio: 8,
    marketCapUsd: 5e9,
  }),
  row({
    symbol: 'BETA',
    name: 'Beta Software Inc.',
    price: 120,
    peRatio: null,
    marketCapUsd: 2e9,
  }),
  row({
    symbol: 'CORE',
    name: 'Core Energy Corp.',
    sector: 'Energy',
    price: 20,
    peRatio: 25,
    marketCapUsd: 5e9,
  }),
  row({
    symbol: 'DATA',
    name: 'Databank Group',
    sector: 'Financials',
    price: 20,
    peRatio: 12,
    marketCapUsd: 1e8,
    type: 'etf',
  }),
  row({
    symbol: 'echo',
    name: 'Echo Media',
    sector: 'Communication',
    price: 5,
    peRatio: 30,
    marketCapUsd: 7e8,
  }),
];

const engine = createQueryEngine(rows);
const base: ScreenerQuery = { text: '', ranges: {}, selects: {}, sort: [] };

function symbols(query: Partial<ScreenerQuery>): string[] {
  return Array.from(
    engine.run({ ...base, ...query }),
    (i) => (rows[i] as Instrument).symbol,
  );
}

describe('createQueryEngine', () => {
  it('reports its size and returns all rows in original order for an empty query', () => {
    expect(engine.size).toBe(5);
    expect(symbols({})).toEqual(['ALFA', 'BETA', 'CORE', 'DATA', 'echo']);
  });

  describe('text search', () => {
    it('matches symbol prefixes and name substrings, case-insensitively', () => {
      expect(symbols({ text: 'al' })).toEqual(['ALFA']);
      expect(symbols({ text: 'BANK' })).toEqual(['ALFA', 'DATA']);
      expect(symbols({ text: 'ECH' })).toEqual(['echo']);
    });

    it('ignores surrounding whitespace and does not match symbol infixes', () => {
      expect(symbols({ text: '  core ' })).toEqual(['CORE']);
      expect(symbols({ text: 'ORE' })).toEqual(['CORE']); // "Core" name substring, not symbol
      expect(symbols({ text: 'zzz' })).toEqual([]);
    });
  });

  describe('range filters', () => {
    it('applies inclusive and open bounds', () => {
      expect(symbols({ ranges: { price: { min: 20, max: 50 } } })).toEqual([
        'ALFA',
        'CORE',
        'DATA',
      ]);
      expect(symbols({ ranges: { price: { min: 100 } } })).toEqual(['BETA']);
      expect(symbols({ ranges: { price: { max: 5 } } })).toEqual(['echo']);
    });

    it('excludes missing values whenever a range is active', () => {
      expect(symbols({ ranges: { peRatio: { min: 0 } } })).not.toContain(
        'BETA',
      );
      expect(symbols({ ranges: { peRatio: {} } })).toContain('BETA'); // no bounds = inactive
    });

    it('combines several ranges with AND', () => {
      expect(
        symbols({ ranges: { price: { min: 20 }, peRatio: { max: 12 } } }),
      ).toEqual(['ALFA', 'DATA']);
    });
  });

  describe('select filters', () => {
    it('keeps rows whose value is one of the selected options', () => {
      expect(
        symbols({ selects: { sector: ['Financials', 'Energy'] } }),
      ).toEqual(['ALFA', 'CORE', 'DATA']);
      expect(symbols({ selects: { type: ['etf'] } })).toEqual(['DATA']);
    });

    it('treats an empty selection as no filter', () => {
      expect(symbols({ selects: { sector: [] } })).toHaveLength(5);
    });
  });

  it('combines text, range and select filters', () => {
    expect(
      symbols({
        text: 'bank',
        ranges: { price: { max: 30 } },
        selects: { sector: ['Financials'] },
      }),
    ).toEqual(['DATA']);
  });

  describe('sorting', () => {
    it('sorts numbers in both directions', () => {
      expect(symbols({ sort: [{ key: 'price', dir: 'asc' }] })).toEqual([
        'echo',
        'CORE',
        'DATA',
        'ALFA',
        'BETA',
      ]);
      expect(symbols({ sort: [{ key: 'price', dir: 'desc' }] })).toEqual([
        'BETA',
        'ALFA',
        'CORE',
        'DATA',
        'echo',
      ]);
    });

    it('puts missing values last in both directions', () => {
      expect(symbols({ sort: [{ key: 'peRatio', dir: 'asc' }] }).at(-1)).toBe(
        'BETA',
      );
      expect(symbols({ sort: [{ key: 'peRatio', dir: 'desc' }] }).at(-1)).toBe(
        'BETA',
      );
    });

    it('sorts text case-insensitively', () => {
      expect(symbols({ sort: [{ key: 'symbol', dir: 'desc' }] })).toEqual([
        'echo',
        'DATA',
        'CORE',
        'BETA',
        'ALFA',
      ]);
    });

    it('applies secondary keys to ties and keeps original order for full ties', () => {
      expect(
        symbols({
          sort: [
            { key: 'marketCapUsd', dir: 'desc' },
            { key: 'price', dir: 'asc' },
          ],
        }),
      ).toEqual(['CORE', 'ALFA', 'BETA', 'echo', 'DATA']);
      // CORE and DATA tie on price: original order (CORE before DATA) is kept.
      expect(
        symbols({ sort: [{ key: 'price', dir: 'asc' }] }).slice(1, 3),
      ).toEqual(['CORE', 'DATA']);
    });

    it('sorts filtered results', () => {
      expect(
        symbols({
          selects: { sector: ['Financials'] },
          sort: [{ key: 'price', dir: 'asc' }],
        }),
      ).toEqual(['DATA', 'ALFA']);
    });
  });

  it('returns a Uint32Array that can be transferred from a worker', () => {
    const result = engine.run(base);
    expect(result).toBeInstanceOf(Uint32Array);
    expect(result.buffer.byteLength).toBe(result.length * 4);
  });

  it('handles an empty dataset', () => {
    expect(
      Array.from(
        createQueryEngine([]).run({
          ...base,
          text: 'a',
          sort: [{ key: 'price', dir: 'asc' }],
        }),
      ),
    ).toEqual([]);
  });
});
