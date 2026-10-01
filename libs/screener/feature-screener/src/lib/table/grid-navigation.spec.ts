import { clampPosition, HEADER_ROW, navigate } from './grid-navigation';

const size = { rows: 100, cols: 5, pageSize: 10 };
const key = (k: string, ctrlKey = false, metaKey = false) => ({
  key: k,
  ctrlKey,
  metaKey,
});

describe('grid navigation', () => {
  it('moves with the arrow keys and stops at the edges', () => {
    expect(navigate({ row: 5, col: 2 }, key('ArrowDown'), size)).toEqual({
      row: 6,
      col: 2,
    });
    expect(navigate({ row: 5, col: 2 }, key('ArrowUp'), size)).toEqual({
      row: 4,
      col: 2,
    });
    expect(navigate({ row: 5, col: 2 }, key('ArrowLeft'), size)).toEqual({
      row: 5,
      col: 1,
    });
    expect(navigate({ row: 5, col: 2 }, key('ArrowRight'), size)).toEqual({
      row: 5,
      col: 3,
    });
    expect(navigate({ row: 99, col: 4 }, key('ArrowDown'), size)).toEqual({
      row: 99,
      col: 4,
    });
    expect(navigate({ row: 5, col: 4 }, key('ArrowRight'), size)).toEqual({
      row: 5,
      col: 4,
    });
    expect(navigate({ row: 5, col: 0 }, key('ArrowLeft'), size)).toEqual({
      row: 5,
      col: 0,
    });
  });

  it('moves between the header row and the first data row', () => {
    expect(navigate({ row: 0, col: 1 }, key('ArrowUp'), size)).toEqual({
      row: HEADER_ROW,
      col: 1,
    });
    expect(navigate({ row: HEADER_ROW, col: 1 }, key('ArrowUp'), size)).toEqual(
      { row: HEADER_ROW, col: 1 },
    );
    expect(
      navigate({ row: HEADER_ROW, col: 1 }, key('ArrowDown'), size),
    ).toEqual({ row: 0, col: 1 });
  });

  it('jumps within the row with Home and End', () => {
    expect(navigate({ row: 5, col: 2 }, key('Home'), size)).toEqual({
      row: 5,
      col: 0,
    });
    expect(navigate({ row: 5, col: 2 }, key('End'), size)).toEqual({
      row: 5,
      col: 4,
    });
  });

  it('jumps to the grid corners with Ctrl or Cmd', () => {
    expect(navigate({ row: 5, col: 2 }, key('Home', true), size)).toEqual({
      row: HEADER_ROW,
      col: 0,
    });
    expect(navigate({ row: 5, col: 2 }, key('End', false, true), size)).toEqual(
      { row: 99, col: 4 },
    );
  });

  it('pages up and down by the page size', () => {
    expect(navigate({ row: 50, col: 3 }, key('PageDown'), size)).toEqual({
      row: 60,
      col: 3,
    });
    expect(navigate({ row: 50, col: 3 }, key('PageUp'), size)).toEqual({
      row: 40,
      col: 3,
    });
    expect(navigate({ row: 95, col: 3 }, key('PageDown'), size)).toEqual({
      row: 99,
      col: 3,
    });
    expect(navigate({ row: 3, col: 3 }, key('PageUp'), size)).toEqual({
      row: HEADER_ROW,
      col: 3,
    });
    expect(
      navigate({ row: HEADER_ROW, col: 3 }, key('PageDown'), size),
    ).toEqual({ row: 10, col: 3 });
  });

  it('ignores other keys', () => {
    expect(navigate({ row: 1, col: 1 }, key('Enter'), size)).toBeNull();
    expect(navigate({ row: 1, col: 1 }, key('a'), size)).toBeNull();
  });

  it('stays on the header row when there are no data rows', () => {
    const empty = { rows: 0, cols: 3, pageSize: 10 };
    expect(
      navigate({ row: HEADER_ROW, col: 0 }, key('ArrowDown'), empty),
    ).toEqual({ row: HEADER_ROW, col: 0 });
    expect(
      navigate({ row: HEADER_ROW, col: 0 }, key('End', true), empty),
    ).toEqual({ row: HEADER_ROW, col: 2 });
  });

  it('clamps a position after the grid shrinks', () => {
    expect(
      clampPosition({ row: 80, col: 9 }, { rows: 10, cols: 3, pageSize: 5 }),
    ).toEqual({ row: 9, col: 2 });
    expect(
      clampPosition({ row: 3, col: 1 }, { rows: 0, cols: 0, pageSize: 5 }),
    ).toEqual({ row: HEADER_ROW, col: 0 });
  });
});
