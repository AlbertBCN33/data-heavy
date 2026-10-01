import { DEFAULT_COLUMNS } from '../market/columns';
import {
  DEFAULT_SORT,
  DEFAULT_VIEW,
  type ScreenerView,
} from './screener-query';
import { decodeView, encodeView, isViewParam, parseRange } from './url-codec';

describe('url codec', () => {
  describe('encodeView', () => {
    it('encodes the default view as no params', () => {
      expect(encodeView(DEFAULT_VIEW)).toEqual({});
    });

    it('encodes every part of a customised view', () => {
      const view: ScreenerView = {
        text: ' bank ',
        ranges: {
          price: { min: 10, max: 200 },
          peRatio: { max: 15 },
          beta: {},
        },
        selects: { sector: ['Utilities', 'Energy'], exchange: [] },
        sort: [
          { key: 'changePct', dir: 'desc' },
          { key: 'symbol', dir: 'asc' },
        ],
        columns: ['symbol', 'price', 'name'],
        selected: 'NASDAQ:ABC',
      };
      expect(encodeView(view)).toEqual({
        q: 'bank',
        price: '10..200',
        peRatio: '..15',
        sector: 'Energy,Utilities', // canonical option order
        sort: '-changePct,symbol',
        cols: 'symbol,price,name',
        sel: 'NASDAQ:ABC',
      });
    });

    it('encodes an explicitly empty sort', () => {
      expect(encodeView({ ...DEFAULT_VIEW, sort: [] })).toEqual({ sort: '' });
    });
  });

  describe('decodeView', () => {
    it('decodes no params as the default view without issues', () => {
      expect(decodeView({})).toEqual({ view: DEFAULT_VIEW, issues: [] });
    });

    it('round-trips any view it encoded', () => {
      const view: ScreenerView = {
        text: 'core',
        ranges: {
          marketCapUsd: { min: 1e9 },
          changePct: { min: -2.5, max: 2.5 },
        },
        selects: { type: ['etf'], country: ['ES', 'US'] },
        sort: [{ key: 'name', dir: 'asc' }],
        columns: ['symbol', 'name', 'country', 'changePct'],
        selected: 'BME:SAN',
      };
      const decoded = decodeView(encodeView(view));
      expect(decoded.issues).toEqual([]);
      expect(decoded.view).toEqual({
        ...view,
        selects: { type: ['etf'], country: ['US', 'ES'] },
      });
      expect(decodeView(encodeView(decoded.view)).view).toEqual(decoded.view);
    });

    it('drops each invalid param on its own and keeps the rest', () => {
      const { view, issues } = decodeView({
        q: 'ok',
        price: 'cheap',
        sector: 'Energy,Crypto',
        bogus: '1',
        sel: 'not an id',
      });
      expect(view.text).toBe('ok');
      expect(view.ranges).toEqual({});
      expect(view.selects).toEqual({ sector: ['Energy'] });
      expect(view.selected).toBeNull();
      expect(issues).toEqual([
        { param: 'price', reason: 'invalid-range' },
        { param: 'sector', reason: 'unknown-value' },
        { param: 'sel', reason: 'invalid-id' },
      ]);
    });

    it('rejects overly long search text', () => {
      const { view, issues } = decodeView({ q: 'x'.repeat(65) });
      expect(view.text).toBe('');
      expect(issues).toEqual([{ param: 'q', reason: 'too-long' }]);
    });

    it('silently ignores params it does not own, such as tracking params', () => {
      const { view, issues } = decodeView({
        lang: 'es',
        sim: '1',
        utm_source: 'newsletter',
        fbclid: 'abc',
        bogus: '1',
        symbol: 'ABC', // a column, but not a filter
      });
      expect(view).toEqual(DEFAULT_VIEW);
      expect(issues).toEqual([]);
    });

    it('treats empty values as not set, except an explicitly empty sort', () => {
      const { view, issues } = decodeView({
        q: ' ',
        price: '',
        sector: '',
        sel: '',
        cols: '',
      });
      expect(view).toEqual(DEFAULT_VIEW);
      expect(issues).toEqual([]);
      expect(decodeView({ sort: '' }).view.sort).toEqual([]);
    });

    it('uses the last value of a repeated param', () => {
      expect(decodeView({ q: ['first', 'second'] }).view.text).toBe('second');
      expect(decodeView({ q: undefined }).view.text).toBe('');
    });

    it('drops an enum filter whose values are all unknown', () => {
      expect(decodeView({ sector: 'Crypto' }).view.selects).toEqual({});
      expect(decodeView({ sector: 'Energy,Energy' }).view.selects).toEqual({
        sector: ['Energy'],
      });
    });

    describe('sort', () => {
      it('parses directions and limits the number of keys', () => {
        const { view, issues } = decodeView({
          sort: '-price,name,-beta,volume,price,nope',
        });
        expect(view.sort).toEqual([
          { key: 'price', dir: 'desc' },
          { key: 'name', dir: 'asc' },
          { key: 'beta', dir: 'desc' },
        ]);
        expect(issues).toEqual([
          { param: 'sort', reason: 'too-many' },
          { param: 'sort', reason: 'duplicate' },
          { param: 'sort', reason: 'unknown-column' },
        ]);
      });

      it('falls back to the default sort when nothing valid remains', () => {
        expect(decodeView({ sort: 'nope' }).view.sort).toEqual(DEFAULT_SORT);
        expect(decodeView({ sort: '' }).view.sort).toEqual([]);
      });
    });

    describe('cols', () => {
      it('always pins the symbol column first and removes duplicates', () => {
        expect(
          decodeView({ cols: 'price,symbol,price,name' }).view.columns,
        ).toEqual(['symbol', 'price', 'name']);
      });

      it('falls back to the default columns when nothing valid remains', () => {
        const { view, issues } = decodeView({ cols: 'nope,symbol' });
        expect(view.columns).toEqual(DEFAULT_COLUMNS);
        expect(issues).toEqual([{ param: 'cols', reason: 'unknown-column' }]);
      });
    });
  });

  describe('parseRange', () => {
    it.each([
      ['10..200', { min: 10, max: 200 }],
      ['10..', { min: 10 }],
      ['..200', { max: 200 }],
      ['1.5..2.5', { min: 1.5, max: 2.5 }],
      ['-3..-1', { min: -3, max: -1 }],
      [' 5 .. 6 ', { min: 5, max: 6 }],
      ['1e9..', { min: 1e9 }],
      ['2.5B..1T', { min: 2.5e9, max: 1e12 }],
      ['300k..2m', { min: 3e5, max: 2e6 }],
      ['7..7', { min: 7, max: 7 }],
    ])('parses %s', (input, expected) => {
      expect(parseRange(input)).toEqual(expected);
    });

    it.each(['', '..', '10', '200..10', 'a..b', '1..2..3', '1x..', '1e999..'])(
      'rejects "%s"',
      (input) => {
        expect(parseRange(input)).toBeNull();
      },
    );
  });

  it('knows which params belong to the view', () => {
    expect(isViewParam('q')).toBe(true);
    expect(isViewParam('price')).toBe(true);
    expect(isViewParam('lang')).toBe(false);
  });
});
