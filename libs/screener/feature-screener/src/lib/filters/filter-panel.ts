import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Button, MultiSelect, type SelectOption } from '@data-heavy/ui';
import {
  type EnumColumn,
  type EnumColumnKey,
  getColumn,
  type NumberColumnKey,
  parseRange,
  type RangeFilter,
  type ScreenerView,
} from '@data-heavy/util';

import { COLUMN_LABELS, optionLabel } from '../screener-labels';

export interface FilterChange {
  readonly patch: Partial<ScreenerView>;
  /** Replace the history entry (typing) instead of pushing one. */
  readonly replaceUrl: boolean;
}

export const ENUM_FILTERS: readonly EnumColumnKey[] = [
  'type',
  'exchange',
  'sector',
  'country',
];
export const RANGE_FILTERS: readonly NumberColumnKey[] = [
  'price',
  'changePct',
  'marketCapUsd',
  'peRatio',
  'dividendYield',
  'volume',
];

export const SEARCH_DEBOUNCE_MS = 250;

interface RangeDraft {
  readonly min: string;
  readonly max: string;
}

let nextId = 0;

/**
 * Filter controls for the screener. Stateless with respect to the view: it renders the current
 * view and emits patches; the URL (via the store) remains the source of truth.
 */
@Component({
  selector: 'dh-filter-panel',
  imports: [Button, MultiSelect],
  templateUrl: './filter-panel.html',
  styleUrl: './filter-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterPanel {
  readonly view = input.required<ScreenerView>();
  readonly locale = input('en-US');

  readonly filterChange = output<FilterChange>();
  readonly clearAll = output<void>();

  protected readonly idPrefix = `dh-filters-${nextId++}`;
  protected readonly labels = COLUMN_LABELS;
  protected readonly enumFilters = ENUM_FILTERS;
  protected readonly rangeFilters = RANGE_FILTERS;

  /** Local text follows the URL but updates immediately while typing. */
  protected readonly text = linkedSignal(() => this.view().text);

  protected readonly options = computed(() => {
    const locale = this.locale();
    const entries = ENUM_FILTERS.map((key): [EnumColumnKey, SelectOption[]] => [
      key,
      (getColumn(key) as EnumColumn).options.map((value) => ({
        value,
        label: optionLabel(key, value, locale),
      })),
    ]);
    return Object.fromEntries(entries) as Record<EnumColumnKey, SelectOption[]>;
  });

  /** Raw input text per range filter, reset whenever the URL changes. */
  protected readonly drafts = linkedSignal(() => {
    const ranges = this.view().ranges;
    const entries = RANGE_FILTERS.map((key): [NumberColumnKey, RangeDraft] => {
      const range = ranges[key];
      return [key, { min: bound(range?.min), max: bound(range?.max) }];
    });
    return Object.fromEntries(entries) as Record<NumberColumnKey, RangeDraft>;
  });

  protected readonly invalid = signal<ReadonlySet<NumberColumnKey>>(new Set());

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected onSearchInput(value: string): void {
    this.text.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.filterChange.emit({ patch: { text: value }, replaceUrl: true });
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onSelect(key: EnumColumnKey, values: readonly string[]): void {
    const selects = { ...this.view().selects, [key]: values };
    if (values.length === 0) {
      delete selects[key];
    }
    this.filterChange.emit({ patch: { selects }, replaceUrl: false });
  }

  protected onRangeInput(
    key: NumberColumnKey,
    edge: 'min' | 'max',
    value: string,
  ): void {
    this.drafts.update((drafts) => ({
      ...drafts,
      [key]: { ...drafts[key], [edge]: value },
    }));
  }

  /** Commits on `change` (blur or Enter) so partial input never reaches the URL. */
  protected commitRange(key: NumberColumnKey): void {
    const { min, max } = this.drafts()[key];
    const empty = min.trim() === '' && max.trim() === '';
    const range: RangeFilter | null = empty
      ? null
      : parseRange(`${min}..${max}`);

    this.invalid.update((set) => {
      const next = new Set(set);
      if (empty || range) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    if (!empty && !range) {
      return;
    }
    const ranges = { ...this.view().ranges };
    if (range) {
      ranges[key] = range;
    } else {
      delete ranges[key];
    }
    this.filterChange.emit({ patch: { ranges }, replaceUrl: false });
  }

  protected errorId(key: NumberColumnKey): string {
    return `${this.idPrefix}-${key}-error`;
  }
}

function bound(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
