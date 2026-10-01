import { DestroyRef, inject, Injectable } from '@angular/core';
import {
  LocaleState,
  MarketDataStore,
  type WatchlistEvent,
  type WatchlistOperation,
  WatchlistStore,
} from '@data-heavy/data-access';
import { ToastService } from '@data-heavy/ui';
import { pluralCategory } from '@data-heavy/util';
import { TranslateService } from '@ngx-translate/core';

/**
 * Turns watchlist store events into toasts: Undo after a change, Retry after a failure, and
 * feedback for offline changes. Lives in one place so every feature that changes the watchlist
 * (drawer, watchlist page) behaves the same without depending on each other.
 *
 * Messages are translated when the event happens (toasts are short-lived).
 */
@Injectable({ providedIn: 'root' })
export class WatchlistNotifications {
  private readonly store = inject(WatchlistStore);
  private readonly market = inject(MarketDataStore);
  private readonly toasts = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly locale = inject(LocaleState).locale;
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
          message: this.t(
            operation.kind === 'add'
              ? 'notifications.added'
              : 'notifications.removed',
            { symbol: this.symbol(operation) },
          ),
          action: {
            label: this.t('notifications.undo'),
            run: () => this.store.apply(undo),
          },
        });
        break;
      }
      case 'failed': {
        const { operation, retryable } = event;
        this.toasts.show({
          kind: 'error',
          message: this.t(
            operation.kind === 'add'
              ? 'notifications.failedAdd'
              : 'notifications.failedRemove',
            { symbol: this.symbol(operation) },
          ),
          action: retryable
            ? {
                label: this.t('notifications.retry'),
                run: () => this.store.apply(operation),
              }
            : undefined,
        });
        break;
      }
      case 'queued': {
        const { operation } = event;
        this.toasts.show({
          message: this.t(
            operation.kind === 'add'
              ? 'notifications.queuedAdd'
              : 'notifications.queuedRemove',
            { symbol: this.symbol(operation) },
          ),
        });
        break;
      }
      case 'synced':
        this.toasts.show({
          kind: 'success',
          message: this.t(
            `notifications.synced.${pluralCategory(event.count, this.locale())}`,
            { count: event.count },
          ),
        });
        break;
    }
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params) as string;
  }

  private symbol(operation: WatchlistOperation): string {
    return (
      this.market.byId().get(operation.instrumentId)?.symbol ??
      operation.instrumentId
    );
  }
}
