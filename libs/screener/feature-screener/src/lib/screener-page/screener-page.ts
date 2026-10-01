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
import {
  LocaleState,
  provideScreenerStore,
  ScreenerStore,
  WatchlistStore,
} from '@data-heavy/data-access';
import { Button, ToastService } from '@data-heavy/ui';
import {
  type ColumnKey,
  getFormatters,
  pluralCategory,
  type SortSpec,
} from '@data-heavy/util';
import {
  translate,
  TranslatePipe,
  TranslateService,
} from '@ngx-translate/core';

import { ColumnPicker } from '../column-picker/column-picker';
import { type FilterChange, FilterPanel } from '../filters/filter-panel';
import { ScreenerTable } from '../table/screener-table';

export type ScreenerState = 'loading' | 'error' | 'empty' | 'ready';

/** Delay before announcing the result count, so typing produces one announcement. */
export const ANNOUNCE_DELAY_MS = 600;

const NARROW_SCREEN = '(max-width: 64rem)';

@Component({
  selector: 'dh-screener-page',
  imports: [Button, ColumnPicker, FilterPanel, ScreenerTable, TranslatePipe],
  providers: [provideScreenerStore()],
  templateUrl: './screener-page.html',
  styleUrl: './screener-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenerPage {
  protected readonly store = inject(ScreenerStore);
  protected readonly watchlist = inject(WatchlistStore);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly toasts = inject(ToastService);

  private readonly translate = inject(TranslateService);
  protected readonly locale = inject(LocaleState).locale;

  protected readonly state = computed<ScreenerState>(() => {
    if (this.store.status() === 'error') {
      return 'error';
    }
    if (this.store.pending()) {
      return 'loading';
    }
    return this.store.rows().length === 0 ? 'empty' : 'ready';
  });

  /** Localised count, e.g. "1,234 of 10,000 instruments" / "1.234 de 10.000 instrumentos". */
  protected readonly countText = translate('screener.count', () => {
    const format = getFormatters(this.locale());
    return {
      matches: format.integer(this.store.rows().length),
      total: format.integer(this.store.total()),
    };
  });

  protected readonly activeFilters = computed(() => {
    const { text, ranges, selects } = this.store.view();
    return (
      (text ? 1 : 0) +
      Object.keys(ranges).length +
      Object.values(selects).filter((v) => v && v.length > 0).length
    );
  });

  /** "1 active" / "1 activo", "3 activos": plural form chosen for the current locale. */
  protected readonly activeFiltersLabel = computed(() => {
    const count = this.activeFilters();
    this.translate.currentLang();
    return this.translate.instant(
      `filters.active.${pluralCategory(count, this.locale())}`,
      { count },
    ) as string;
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
      const message = this.countText() as string;
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
            message: this.translate.instant(
              'screener.ignoredSettings',
            ) as string,
          }),
        );
      }
    });
  }
}
