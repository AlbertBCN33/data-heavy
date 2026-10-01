import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { provideScreenerStore, ScreenerStore } from '@data-heavy/data-access';
import { Button, ToastService } from '@data-heavy/ui';
import type { ColumnKey, SortSpec } from '@data-heavy/util';

import { ColumnPicker } from '../column-picker/column-picker';
import { type FilterChange, FilterPanel } from '../filters/filter-panel';
import { ScreenerTable } from '../table/screener-table';

export type ScreenerState = 'loading' | 'error' | 'empty' | 'ready';

/** Delay before announcing the result count, so typing produces one announcement. */
export const ANNOUNCE_DELAY_MS = 600;

const NARROW_SCREEN = '(max-width: 64rem)';

@Component({
  selector: 'dh-screener-page',
  imports: [Button, ColumnPicker, FilterPanel, ScreenerTable],
  providers: [provideScreenerStore()],
  templateUrl: './screener-page.html',
  styleUrl: './screener-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenerPage {
  protected readonly store = inject(ScreenerStore);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly toasts = inject(ToastService);

  protected readonly locale = 'en-US';
  private readonly numberFormat = new Intl.NumberFormat(this.locale);

  protected readonly state = computed<ScreenerState>(() => {
    if (this.store.status() === 'error') {
      return 'error';
    }
    if (this.store.pending()) {
      return 'loading';
    }
    return this.store.rows().length === 0 ? 'empty' : 'ready';
  });

  protected readonly countText = computed(() => {
    const total = this.numberFormat.format(this.store.total());
    const matches = this.numberFormat.format(this.store.rows().length);
    return `${matches} of ${total} instruments`;
  });

  protected readonly activeFilters = computed(() => {
    const { text, ranges, selects } = this.store.view();
    return (
      (text ? 1 : 0) +
      Object.keys(ranges).length +
      Object.values(selects).filter((v) => v && v.length > 0).length
    );
  });

  protected readonly filtersOpen = signal(
    typeof matchMedia === 'undefined' || !matchMedia(NARROW_SCREEN).matches,
  );

  constructor() {
    this.announceResultCount();
    this.reportIgnoredLinkSettings();
  }

  protected onFilterChange({ patch, replaceUrl }: FilterChange): void {
    this.store.update(patch, { replaceUrl });
  }

  protected onSortChange(sort: SortSpec[]): void {
    this.store.update({ sort });
  }

  protected onColumnsChange(columns: ColumnKey[]): void {
    this.store.update({ columns });
  }

  protected onRowActivate(id: string): void {
    this.store.update({ selected: id });
  }

  /**
   * One polite announcement per settled result, not per keystroke. The visible count is not a
   * live region itself, so screen readers do not hear it twice.
   */
  private announceResultCount(): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      if (this.state() === 'loading' || this.state() === 'error') {
        return;
      }
      const message = this.countText();
      clearTimeout(timer);
      timer = setTimeout(() => {
        void this.announcer.announce(message, 'polite');
      }, ANNOUNCE_DELAY_MS);
    });
  }

  /** A shared or outdated link may contain settings that no longer apply. Say so once. */
  private reportIgnoredLinkSettings(): void {
    let reported = false;
    effect(() => {
      const issues = this.store.issues();
      if (issues.length > 0 && !reported) {
        reported = true;
        untracked(() =>
          this.toasts.show({
            message:
              'Some settings in this link were not recognised and have been ignored.',
          }),
        );
      }
    });
  }
}
