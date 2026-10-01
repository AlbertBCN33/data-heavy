import {
  getColumn,
  MAX_SORT_KEYS,
  type ColumnKey,
  type SortDirection,
  type SortSpec,
} from '@data-heavy/util';

/** Numbers start descending (largest first); text starts ascending (A→Z). */
export function defaultDirection(key: ColumnKey): SortDirection {
  return getColumn(key)?.kind === 'number' ? 'desc' : 'asc';
}

/**
 * Next sort after a header is activated.
 *
 * - Plain activation sorts by that column only, toggling its direction if it was already the only key.
 * - Additive activation (Shift) toggles the column if it is already a key, otherwise appends it
 *   as the next tie-breaker (replacing the last one beyond the limit).
 */
export function nextSort(
  current: readonly SortSpec[],
  key: ColumnKey,
  additive: boolean,
): SortSpec[] {
  const existing = current.find((s) => s.key === key);
  const toggled = (s: SortSpec): SortSpec => ({
    key: s.key,
    dir: s.dir === 'asc' ? 'desc' : 'asc',
  });

  if (!additive) {
    return existing && current.length === 1
      ? [toggled(existing)]
      : [{ key, dir: defaultDirection(key) }];
  }
  if (existing) {
    return current.map((s) => (s.key === key ? toggled(s) : s));
  }
  const added = { key, dir: defaultDirection(key) };
  return current.length < MAX_SORT_KEYS
    ? [...current, added]
    : [...current.slice(0, MAX_SORT_KEYS - 1), added];
}

export type AriaSort = 'ascending' | 'descending' | 'none';

/** `aria-sort` goes on the primary sort column only, as the ARIA spec recommends. */
export function ariaSort(
  sort: readonly SortSpec[],
  key: ColumnKey,
): AriaSort | null {
  const primary = sort[0];
  if (primary?.key !== key) {
    return null;
  }
  return primary.dir === 'asc' ? 'ascending' : 'descending';
}
