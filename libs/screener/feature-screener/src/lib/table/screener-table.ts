import {
  CdkVirtualForOf,
  CdkVirtualScrollableElement,
  CdkVirtualScrollViewport,
  CdkFixedSizeVirtualScroll,
} from '@angular/cdk/scrolling';
import {
  afterEveryRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Skeleton } from '@data-heavy/ui';
import {
  type RegisteredColumn,
  type ColumnKey,
  type EnumColumnKey,
  getColumn,
  getFormatters,
  type Instrument,
  type SortSpec,
} from '@data-heavy/util';

import { COLUMN_LABELS, optionLabel } from '../screener-labels';
import {
  type CellPosition,
  clampPosition,
  HEADER_ROW,
  navigate,
} from './grid-navigation';
import { ariaSort, nextSort } from './sorting';

/** Row height in px; fixed so the virtual scroll strategy can compute positions. */
export const ROW_HEIGHT = 40;

const COLUMN_WIDTHS: Readonly<Record<ColumnKey, string>> = {
  symbol: '6.5rem',
  name: 'minmax(12rem, 18rem)',
  type: '5.5rem',
  exchange: '6.5rem',
  sector: '11rem',
  country: '9rem',
  price: '8rem',
  changePct: '6.5rem',
  volume: '6.5rem',
  marketCapUsd: '8rem',
  peRatio: '5.5rem',
  dividendYield: '6.5rem',
  beta: '4.5rem',
  high52w: '8rem',
  low52w: '8rem',
};

const SKELETON_ROWS = Array.from({ length: 12 }, (_, i) => i);

/**
 * Virtualized data grid (WAI-ARIA grid pattern).
 *
 * - Only visible rows are in the DOM. `aria-rowcount` and `aria-rowindex` tell assistive
 *   technology the real size and position, so "row 5,312 of 10,001" is announced correctly.
 * - One scroll container for both axes (`cdkVirtualScrollingElement`), so the header row and the
 *   symbol column can be sticky without syncing scroll positions.
 * - A single tab stop: the active cell. Arrow keys, Home/End, Ctrl+Home/End and PageUp/PageDown
 *   move it; when it is virtualized out of the DOM, the grid itself takes the tab stop and hands
 *   focus back once the cell is rendered again.
 * - Headers sort on click/Enter/Space (Shift adds a tie-breaker). Rows activate on click/Enter.
 */
@Component({
  selector: 'dh-screener-table',
  imports: [
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollableElement,
    Skeleton,
  ],
  templateUrl: './screener-table.html',
  styleUrl: './screener-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenerTable {
  readonly rows = input.required<readonly Instrument[]>();
  readonly columns = input.required<readonly ColumnKey[]>();
  readonly sort = input.required<readonly SortSpec[]>();
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false, { transform: booleanAttribute });
  /** Accessible name of the grid. */
  readonly label = input.required<string>();
  readonly locale = input('en-US');

  readonly sortChange = output<SortSpec[]>();
  /** Emits the instrument id when a row is activated (click or Enter/Space). */
  readonly rowActivate = output<string>();

  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly skeletonRows = SKELETON_ROWS;
  protected readonly headerRow = HEADER_ROW;
  protected readonly labels = COLUMN_LABELS;

  protected readonly defs = computed(() =>
    this.columns().map((key) => getColumn(key) as RegisteredColumn),
  );
  protected readonly gridTemplate = computed(() =>
    this.columns()
      .map((key) => COLUMN_WIDTHS[key])
      .join(' '),
  );
  private readonly formatters = computed(() => getFormatters(this.locale()));

  private readonly activeCell = signal<CellPosition>({
    row: HEADER_ROW,
    col: 0,
  });
  /** The active cell, kept valid when rows or columns change. */
  protected readonly active = computed(() =>
    clampPosition(this.activeCell(), this.size()),
  );
  private readonly size = computed(() => ({
    rows: this.loading() ? 0 : this.rows().length,
    cols: this.columns().length,
    pageSize: this.pageSize(),
  }));
  private readonly pageSize = signal(10);
  /** Whether the active cell is currently in the DOM (otherwise the grid holds the tab stop). */
  protected readonly activeRendered = signal(true);

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private pendingFocus = false;

  /** Whether keyboard focus is (or should be) inside the grid. */
  private focusWithin = false;

  constructor() {
    afterEveryRender({
      read: () => {
        this.updateRenderedState();
        if (this.pendingFocus && this.focusActiveCell()) {
          this.pendingFocus = false;
        }
      },
    });

    // New results (sort, filter, reload). If the user is not in the grid, start from the top;
    // if they are, keep their position (focus is restored by onFocusOut if the cell was replaced).
    effect(() => {
      this.rows();
      untracked(() => {
        if (!this.focusWithin) {
          this.activeCell.update(({ col }) => ({ row: HEADER_ROW, col }));
          const scroller = this.scroller();
          if (scroller) {
            scroller.scrollTop = 0;
          }
        }
      });
    });
  }

  protected onFocusIn(): void {
    this.focusWithin = true;
  }

  /**
   * Distinguishes "the user left the grid" from "the focused cell was removed" (new results
   * replaced the rendered rows). In the second case focus is put back on the active cell instead
   * of being dropped on <body>.
   */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.contains(next)) {
      return;
    }
    const target = event.target as HTMLElement;
    queueMicrotask(() => {
      if (
        !target.isConnected &&
        !this.host.contains(this.document.activeElement)
      ) {
        this.pendingFocus = true;
        if (this.focusActiveCell()) {
          this.pendingFocus = false;
        }
      } else if (!this.host.contains(this.document.activeElement)) {
        this.focusWithin = false;
      }
    });
  }

  protected cellText(column: RegisteredColumn, row: Instrument): string {
    const value = row[column.key];
    if (column.kind === 'enum') {
      return optionLabel(
        column.key as EnumColumnKey,
        value as string,
        this.locale(),
      );
    }
    return this.formatters().cell(column.format, value, row.currency);
  }

  protected trend(
    column: RegisteredColumn,
    row: Instrument,
  ): 'up' | 'down' | null {
    if (column.key !== 'changePct') {
      return null;
    }
    return row.changePct > 0 ? 'up' : row.changePct < 0 ? 'down' : null;
  }

  protected ariaSort(key: ColumnKey) {
    return ariaSort(this.sort(), key);
  }

  /** 1-based position among sort keys and direction, for the visual indicator. */
  protected sortState(key: ColumnKey) {
    const index = this.sort().findIndex((s) => s.key === key);
    if (index < 0) {
      return null;
    }
    return { priority: index + 1, dir: (this.sort()[index] as SortSpec).dir };
  }

  protected isActive(row: number, col: number): boolean {
    const active = this.active();
    return active.row === row && active.col === col;
  }

  protected onHeaderActivate(
    key: ColumnKey,
    col: number,
    additive: boolean,
  ): void {
    this.activeCell.set({ row: HEADER_ROW, col });
    this.sortChange.emit(nextSort(this.sort(), key, additive));
  }

  protected onRowClick(event: MouseEvent, row: number, id: string): void {
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-col]',
    );
    this.activeCell.set({ row, col: Number(cell?.dataset['col'] ?? 0) });
    this.rowActivate.emit(id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const active = this.active();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (active.row === HEADER_ROW) {
        const key = this.columns()[active.col];
        if (key) {
          this.onHeaderActivate(key, active.col, event.shiftKey);
        }
      } else {
        const row = this.rows()[active.row];
        if (row) {
          this.rowActivate.emit(row.id);
        }
      }
      return;
    }
    const next = navigate(active, event, this.size());
    if (!next) {
      return;
    }
    event.preventDefault();
    this.activeCell.set(next);
    this.scrollIntoView(next.row);
    this.pendingFocus = true;
  }

  /** Tabbing onto the grid while the active cell is virtualized away: bring it back. */
  protected onGridFocus(event: FocusEvent): void {
    if (event.target === event.currentTarget) {
      this.scrollIntoView(this.active().row);
      this.pendingFocus = true;
    }
  }

  /**
   * Rows are tracked by position, not by instrument id: a re-sort then updates each rendered row
   * in place instead of moving DOM nodes around. Moving a node drops its focus, so tracking by id
   * would throw keyboard users out of the grid whenever results change. It is also less DOM work.
   */
  protected trackByIndex(index: number): number {
    return index;
  }

  /**
   * Scrolls the minimum needed to show a row below the sticky header. Done by hand because the
   * row may not be rendered yet (virtualized), so the browser cannot scroll it into view.
   * Measured on the scroll container directly: with an external scrolling element, the CDK's
   * `measureScrollOffset` is relative to the viewport while `scrollToOffset` is not.
   */
  private scrollIntoView(row: number): void {
    const scroller = this.scroller();
    if (!scroller || row < 0) {
      return;
    }
    const header = this.headerHeight();
    const rowTop = header + row * ROW_HEIGHT;
    if (rowTop < scroller.scrollTop + header) {
      scroller.scrollTop = rowTop - header;
    } else if (
      rowTop + ROW_HEIGHT >
      scroller.scrollTop + scroller.clientHeight
    ) {
      scroller.scrollTop = rowTop + ROW_HEIGHT - scroller.clientHeight;
    }
  }

  /** Focus also scrolls horizontally; `scroll-padding` keeps the cell clear of sticky parts. */
  private focusActiveCell(): boolean {
    const { row, col } = this.active();
    const cell = this.host.querySelector<HTMLElement>(
      `[data-row="${row}"][data-col="${col}"]`,
    );
    cell?.focus();
    return !!cell;
  }

  private scroller(): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.dh-grid-scroller');
  }

  private headerHeight(): number {
    return (
      this.host.querySelector<HTMLElement>('.dh-grid__header')?.offsetHeight ??
      0
    );
  }

  private updateRenderedState(): void {
    const { row } = this.active();
    const rendered =
      row === HEADER_ROW ||
      !!this.host.querySelector(`[data-row="${row}"][data-col]`);
    if (rendered !== this.activeRendered()) {
      this.activeRendered.set(rendered);
    }
    const height = (this.scroller()?.clientHeight ?? 0) - this.headerHeight();
    const pageSize = Math.max(1, Math.floor(height / ROW_HEIGHT) - 1);
    if (height > 0 && pageSize !== this.pageSize()) {
      this.pageSize.set(pageSize);
    }
  }
}
