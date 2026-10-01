import { computed, effect, inject, Injectable } from '@angular/core';
import {
  DEFAULT_SORT,
  type Instrument,
  type ScreenerQuery,
  type ScreenerView,
  toQuery,
} from '@data-heavy/util';

import { QueryRunner } from '../query/query-runner';
import { MarketDataStore } from './market-data.store';
import { ScreenerUrlState, type UpdateOptions } from './screener-url-state';

/**
 * Page-level store for the screener: joins the URL view, the dataset and the query runner.
 *
 * Provide it (with `QueryRunner`) in the screener route or page component; use
 * `provideScreenerStore()`.
 */
@Injectable()
export class ScreenerStore {
  private readonly url = inject(ScreenerUrlState);
  private readonly market = inject(MarketDataStore);
  private readonly runner = inject(QueryRunner);

  readonly view = this.url.view;
  readonly issues = this.url.issues;
  readonly status = this.market.status;
  readonly retryable = this.market.retryable;
  readonly asOf = this.market.asOf;
  readonly total = computed(() => this.market.instruments().length);

  /**
   * Only the parts of the view that affect results. Selection or column changes do not re-run
   * the query.
   */
  readonly query = computed(() => toQuery(this.view()), {
    equal: sameQuery,
  });

  /** Matching rows in display order; the previous rows stay while a new query runs. */
  readonly rows = computed<readonly Instrument[]>(() => {
    const result = this.runner.result();
    if (!result) {
      return [];
    }
    const { dataset, indexes } = result;
    const rows = new Array<Instrument>(indexes.length);
    for (let i = 0; i < indexes.length; i++) {
      rows[i] = dataset[indexes[i] as number] as Instrument;
    }
    return rows;
  });

  /** `true` until the first result for the loaded dataset is available. */
  readonly pending = computed(
    () =>
      this.status() === 'loading' ||
      (this.status() === 'ready' && !this.runner.result()),
  );
  readonly updating = this.runner.busy;
  readonly lastQueryMs = computed(
    () => this.runner.result()?.durationMs ?? null,
  );
  readonly onWorker = this.runner.onWorker;

  constructor() {
    effect(() => {
      if (this.status() === 'ready') {
        this.runner.setDataset(this.market.instruments());
      }
    });
    effect(() => this.runner.submit(this.query()));
  }

  update(patch: Partial<ScreenerView>, options?: UpdateOptions): void {
    this.url.update(patch, options);
  }

  reset(): void {
    const { columns, selected } = this.view();
    this.url.navigate({
      text: '',
      ranges: {},
      selects: {},
      sort: DEFAULT_SORT,
      columns,
      selected,
    });
  }

  reload(): void {
    this.market.reload();
  }
}

export function provideScreenerStore() {
  return [QueryRunner, ScreenerStore];
}

function sameQuery(a: ScreenerQuery, b: ScreenerQuery): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
