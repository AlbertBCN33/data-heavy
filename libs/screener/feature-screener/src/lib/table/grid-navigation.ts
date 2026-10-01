/** A cell position. `row` is `-1` for the header row, otherwise a data row index. */
export interface CellPosition {
  readonly row: number;
  readonly col: number;
}

export interface GridSize {
  /** Number of data rows (excluding the header). */
  readonly rows: number;
  readonly cols: number;
  /** Data rows per page, for PageUp/PageDown. */
  readonly pageSize: number;
}

export const HEADER_ROW = -1;

/**
 * Keyboard navigation for the data grid, following the WAI-ARIA grid pattern:
 *
 * | Key                    | Moves to                         |
 * | ---------------------- | -------------------------------- |
 * | Arrow keys             | Adjacent cell (header included)  |
 * | Home / End             | First / last cell in the row     |
 * | Ctrl+Home / Ctrl+End   | First / last cell in the grid    |
 * | PageUp / PageDown      | One page up / down, same column  |
 *
 * Returns `null` for keys that are not navigation keys, so the caller can leave them alone.
 */
export function navigate(
  from: CellPosition,
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>,
  size: GridSize,
): CellPosition | null {
  const lastRow = size.rows - 1;
  const lastCol = size.cols - 1;
  const ctrl = event.ctrlKey || event.metaKey;

  const at = (row: number, col: number): CellPosition => ({
    row: clamp(row, HEADER_ROW, lastRow),
    col: clamp(col, 0, lastCol),
  });

  switch (event.key) {
    case 'ArrowUp':
      return at(from.row - 1, from.col);
    case 'ArrowDown':
      return at(from.row + 1, from.col);
    case 'ArrowLeft':
      return at(from.row, from.col - 1);
    case 'ArrowRight':
      return at(from.row, from.col + 1);
    case 'Home':
      return ctrl ? at(HEADER_ROW, 0) : at(from.row, 0);
    case 'End':
      return ctrl ? at(lastRow, lastCol) : at(from.row, lastCol);
    case 'PageUp':
      return at(from.row - size.pageSize, from.col);
    case 'PageDown':
      // From the header, a page down lands on the last row of the first page.
      return at(Math.max(from.row, 0) + size.pageSize, from.col);
    default:
      return null;
  }
}

/** Keeps a position valid after the grid shrinks (e.g. a filter removed rows). */
export function clampPosition(
  position: CellPosition,
  size: GridSize,
): CellPosition {
  return {
    row: clamp(position.row, HEADER_ROW, size.rows - 1),
    col: clamp(position.col, 0, Math.max(size.cols - 1, 0)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(max, min));
}
