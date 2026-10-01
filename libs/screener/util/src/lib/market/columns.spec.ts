import {
  COLUMN_KEYS,
  COLUMNS,
  DEFAULT_COLUMNS,
  getColumn,
  isColumnKey,
  isEnumColumnKey,
  isNumberColumnKey,
  PINNED_COLUMN,
} from './columns';

describe('column registry', () => {
  it('has unique keys and starts the default columns with the pinned column', () => {
    expect(new Set(COLUMN_KEYS).size).toBe(COLUMNS.length);
    expect(DEFAULT_COLUMNS[0]).toBe(PINNED_COLUMN);
  });

  it('right-aligns numbers and left-aligns text', () => {
    for (const column of COLUMNS) {
      expect(column.align).toBe(column.kind === 'number' ? 'end' : 'start');
    }
  });

  it('identifies columns by kind', () => {
    expect(isColumnKey('price')).toBe(true);
    expect(isColumnKey('nope')).toBe(false);
    expect(isNumberColumnKey('price')).toBe(true);
    expect(isNumberColumnKey('sector')).toBe(false);
    expect(isEnumColumnKey('sector')).toBe(true);
    expect(isEnumColumnKey('symbol')).toBe(false);
    expect(getColumn('sector')).toMatchObject({ kind: 'enum' });
    expect(getColumn('nope')).toBeUndefined();
  });
});
