import { DestroyRef, inject, Injectable } from '@angular/core';
import {
  MarketDataStore,
  type WatchlistEvent,
  type WatchlistOperation,
  WatchlistStore,
} from '@data-heavy/data-access';
import { ToastService } from '@data-heavy/ui';

/**
 * Turns watchlist store events into toasts: Undo after a change, Retry after a failure, and
 * feedback for offline changes. Lives in one place so every feature that changes the watchlist
 * (drawer, watchlist page) behaves the same without depending on each other.
 */
@Injectable({ providedIn: 'root' })
export class WatchlistNotifications {
  private readonly store = inject(WatchlistStore);
  private readonly market = inject(MarketDataStore);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  /** Idempotent: every lazily loaded page that changes the watchlist calls it. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const subscription = this.store.events.subscribe((event) =>
      this.notify(event),
    );
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private notify(event: WatchlistEvent): void {
    switch (event.type) {
      case 'saved': {
        const { operation, undo } = event;
        this.toasts.show({
          kind: 'success',
          message:
            operation.kind === 'add'
              ? `Added ${this.symbol(operation)} to your watchlist.`
              : `Removed ${this.symbol(operation)} from your watchlist.`,
          action: { label: 'Undo', run: () => this.store.apply(undo) },
        });
        break;
      }
      case 'failed': {
        const { operation, retryable } = event;
        const verb = operation.kind === 'add' ? 'add' : 'remove';
        this.toasts.show({
          kind: 'error',
          message: `Couldn't ${verb} ${this.symbol(operation)}. Your change was undone.`,
          action: retryable
            ? { label: 'Retry', run: () => this.store.apply(operation) }
            : undefined,
        });
        break;
      }
      case 'queued': {
        const { operation } = event;
        const verb = operation.kind === 'add' ? 'added to' : 'removed from';
        this.toasts.show({
          message: `You're offline. ${this.symbol(operation)} will be ${verb} your watchlist when you reconnect.`,
        });
        break;
      }
      case 'synced':
        this.toasts.show({
          kind: 'success',
          message:
            event.count === 1
              ? 'Back online: 1 watchlist change saved.'
              : `Back online: ${event.count} watchlist changes saved.`,
        });
        break;
    }
  }

  private symbol(operation: WatchlistOperation): string {
    return (
      this.market.byId().get(operation.instrumentId)?.symbol ??
      operation.instrumentId
    );
  }
}
