import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
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
}
