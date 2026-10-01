import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketDataStore, WatchlistStore } from '@data-heavy/data-access';
import { Button, Skeleton } from '@data-heavy/ui';
import { getFormatters, type Instrument } from '@data-heavy/util';

import { WatchlistNotifications } from '../notifications/watchlist-notifications';

interface Row {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly price: string;
  readonly change: string;
  readonly trend: 'up' | 'down' | null;
}

/**
 * The user's watchlist. Removing a row moves focus to the next row's Remove button (or the
 * heading when the list becomes empty), so keyboard users never lose their place.
 */
@Component({
  selector: 'dh-watchlist-page',
  imports: [Button, RouterLink, Skeleton],
  templateUrl: './watchlist-page.html',
  styleUrl: './watchlist-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistPage {
  protected readonly store = inject(WatchlistStore);
  private readonly market = inject(MarketDataStore);
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly locale = 'en-US';
  protected readonly skeletonRows = [1, 2, 3];

  protected readonly status = computed(() => {
    if (this.store.status() === 'error' || this.market.status() === 'error') {
      return 'error';
    }
    return this.store.status() === 'ready' && this.market.status() === 'ready'
      ? 'ready'
      : 'loading';
  });

  protected readonly rows = computed<readonly Row[]>(() => {
    const f = getFormatters(this.locale);
    const byId = this.market.byId();
    return this.store
      .ids()
      .map((id) => byId.get(id))
      .filter((i): i is Instrument => !!i)
      .map((i) => ({
        id: i.id,
        symbol: i.symbol,
        name: i.name,
        price: f.price(i.price, i.currency),
        change: f.signedPercent(i.changePct),
        trend: i.changePct > 0 ? 'up' : i.changePct < 0 ? 'down' : null,
      }));
  });

  protected readonly queuedMessage = computed(() => {
    const count = this.store.queuedCount();
    return count === 1
      ? "1 change will be saved when you're back online."
      : `${count} changes will be saved when you're back online.`;
  });

  private focusAfterRemove: number | null = null;

  constructor() {
    inject(WatchlistNotifications).start();
    afterEveryRender({
      read: () => {
        if (this.focusAfterRemove === null) {
          return;
        }
        const buttons = this.host.querySelectorAll<HTMLElement>(
          '.dh-watchlist__remove',
        );
        const target =
          buttons[Math.min(this.focusAfterRemove, buttons.length - 1)] ??
          this.host.querySelector<HTMLElement>('h1');
        target?.focus();
        this.focusAfterRemove = null;
      },
    });
  }

  protected remove(index: number, id: string): void {
    this.focusAfterRemove = index;
    this.store.remove(id);
  }

  protected retry(): void {
    this.store.reload();
    this.market.reload();
  }
}
