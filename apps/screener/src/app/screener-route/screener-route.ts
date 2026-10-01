import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
} from '@angular/core';
import { ScreenerUrlState } from '@data-heavy/data-access';
import { InstrumentDrawer } from '@data-heavy/feature-detail';
import { ScreenerPage } from '@data-heavy/feature-screener';

/**
 * Composes the screener and the detail drawer. Features cannot import each other (ADR 0004), so
 * the app wires them together; they share state only through the URL (`sel=`).
 *
 * The drawer is deferred: its code (and the chart) loads when something is selected, and is
 * prefetched when the browser is idle so the first open is instant.
 */
@Component({
  selector: 'dh-screener-route',
  imports: [ScreenerPage, InstrumentDrawer],
  templateUrl: './screener-route.html',
  styleUrl: './screener-route.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenerRoute {
  private readonly url = inject(ScreenerUrlState);
  protected readonly hasSelection = computed(
    () => this.url.view().selected !== null,
  );

  constructor() {
    // The drawer changes the watchlist; feedback (Undo, Retry) comes from one shared notifier.
    // Loaded dynamically: feature-watchlist is a lazy route, so a static import would merge it
    // into this chunk (and Nx's boundary rule forbids it).
    const injector = inject(Injector);
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => (destroyed = true));
    void import('@data-heavy/feature-watchlist').then((m) => {
      // The route may be gone by the time the chunk arrives (fast navigation).
      if (!destroyed) {
        injector.get(m.WatchlistNotifications).start();
      }
    });
  }
}
