import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, type Params, Router } from '@angular/router';
import {
  decodeView,
  encodeView,
  isViewParam,
  type QueryParams,
  type ScreenerView,
} from '@data-heavy/util';
import { filter, map } from 'rxjs';

export interface UpdateOptions {
  /**
   * Replace the current history entry instead of pushing a new one. Use for high-frequency
   * edits (typing in the search box) so Back does not step through every keystroke.
   */
  readonly replaceUrl?: boolean;
}

/**
 * The URL is the single source of truth for the screener view. This service decodes the query
 * params into a `ScreenerView` signal and writes changes back through the router, so shared links,
 * reloads and Back/Forward all restore the same view. There is no second copy of this state.
 *
 * Params owned by other features (e.g. `lang`) are preserved on every write.
 */
@Injectable({ providedIn: 'root' })
export class ScreenerUrlState {
  private readonly router = inject(Router);

  private readonly params = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentParams()),
    ),
    { initialValue: this.currentParams() },
  );

  private readonly decoded = computed(() =>
    decodeView(this.params() as QueryParams),
  );

  /** Only changes when the view actually changes, not on unrelated param updates. */
  readonly view = computed(() => this.decoded().view, {
    equal: (a, b) => sameView(a, b),
  });

  /** Params that were dropped while decoding (invalid or outdated links). */
  readonly issues = computed(() => this.decoded().issues);

  update(patch: Partial<ScreenerView>, options: UpdateOptions = {}): void {
    this.navigate({ ...this.view(), ...patch }, options);
  }

  /** Writes a complete view (e.g. "reset filters"). */
  navigate(
    view: ScreenerView,
    { replaceUrl = false }: UpdateOptions = {},
  ): void {
    const foreign = Object.fromEntries(
      Object.entries(this.currentParams()).filter(([key]) => !isViewParam(key)),
    );
    void this.router.navigate([], {
      queryParams: { ...foreign, ...encodeView(view) },
      replaceUrl,
    });
  }

  private currentParams(): Params {
    return this.router.routerState.snapshot.root.queryParams;
  }
}

function sameView(a: ScreenerView, b: ScreenerView): boolean {
  const ea = encodeView(a);
  const eb = encodeView(b);
  const keys = Object.keys(ea);
  return (
    keys.length === Object.keys(eb).length &&
    keys.every((key) => ea[key] === eb[key])
  );
}
