import {
  computed,
  effect,
  inject,
  Injectable,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { INSTRUMENT_ID_PATTERN } from '@data-heavy/util';
import { Observable, Subject } from 'rxjs';

import { KEY_VALUE_STORAGE } from '../key-value-storage';
import { isMarketDataError } from '../market-data-error';
import { MarketDataPort } from '../market-data.port';
import { NetworkStatus } from '../network/network-status';

export type WatchlistOperation =
  | {
      readonly kind: 'add';
      readonly instrumentId: string;
      readonly position?: number;
    }
  | { readonly kind: 'remove'; readonly instrumentId: string };

export type WatchlistEvent =
  /** A change was saved. `undo` is the operation that reverses it. */
  | {
      readonly type: 'saved';
      readonly operation: WatchlistOperation;
      readonly undo: WatchlistOperation;
    }
  /** A change could not be saved and was rolled back. */
  | {
      readonly type: 'failed';
      readonly operation: WatchlistOperation;
      readonly retryable: boolean;
    }
  /** Offline: the change is kept locally and will be saved when back online. */
  | { readonly type: 'queued'; readonly operation: WatchlistOperation }
  /** Back online: queued changes were saved. */
  | { readonly type: 'synced'; readonly count: number };

interface PendingOperation {
  readonly token: number;
  readonly operation: WatchlistOperation;
  /** Reverses the operation; computed when it was requested. */
  readonly undo: WatchlistOperation;
}

/** Changes made while offline survive a reload. */
export const WATCHLIST_OUTBOX_KEY = 'dh.watchlist.outbox.v1';

/**
 * The user's watchlist with optimistic updates.
 *
 * - The UI reads `ids`: the confirmed list with pending operations applied on top, so a change
 *   shows instantly.
 * - Operations are sent one at a time, in order. A failed operation is dropped from the pending
 *   queue, which rolls the view back, and a `failed` event lets the UI offer a retry.
 * - Offline, operations stay pending, are persisted (outbox) and are sent when the connection
 *   returns.
 *
 * The store does not show toasts itself (data-access does not depend on ui). It emits `events`;
 * a notifier component turns them into messages with Undo or Retry.
 */
@Injectable({ providedIn: 'root' })
export class WatchlistStore {
  private readonly port = inject(MarketDataPort);
  private readonly network = inject(NetworkStatus);
  private readonly storage = inject(KEY_VALUE_STORAGE);

  private readonly loaded = resource({
    loader: ({ abortSignal }) => this.port.getWatchlist(abortSignal),
  });

  // Declared before `pending`: its initializer (restoreOutbox) hands out tokens.
  private nextToken = 1;

  /** Last list known to be saved. */
  private readonly confirmed = signal<readonly string[] | null>(null);
  private readonly pending = signal<readonly PendingOperation[]>(
    this.restoreOutbox(),
  );
  private readonly eventStream = new Subject<WatchlistEvent>();
  private sending = false;
  /** Set when changes were kept offline; reported as `synced` once they are all saved. */
  private hasQueuedChanges = this.pending().length > 0;

  readonly events: Observable<WatchlistEvent> = this.eventStream.asObservable();

  readonly status = computed(() => {
    if (this.confirmed() !== null) {
      return 'ready' as const;
    }
    return this.loaded.status() === 'error'
      ? ('error' as const)
      : ('loading' as const);
  });

  /** Watched instrument ids in order, including changes that are not saved yet. */
  readonly ids = computed<readonly string[]>(() =>
    this.pending().reduce(
      (ids, p) => apply(ids, p.operation),
      this.confirmed() ?? [],
    ),
  );
  readonly idSet = computed(() => new Set(this.ids()));
  /** Changes waiting for the connection to return. */
  readonly queuedCount = computed(() =>
    this.network.online() ? 0 : this.pending().length,
  );

  constructor() {
    effect(() => {
      if (this.loaded.hasValue() && this.confirmed() === null) {
        this.confirmed.set(this.loaded.value());
      }
    });
    // Send whatever is pending once the list is known and the browser is online
    // (initial load, queued offline changes, reconnection).
    effect(() => {
      const ready = this.confirmed() !== null;
      const online = this.network.online();
      const hasPending = this.pending().length > 0;
      if (ready && online && hasPending) {
        untracked(() => void this.drain());
      }
    });
  }

  has(instrumentId: string): boolean {
    return this.idSet().has(instrumentId);
  }

  add(instrumentId: string, position?: number): void {
    if (!INSTRUMENT_ID_PATTERN.test(instrumentId) || this.has(instrumentId)) {
      return;
    }
    this.enqueue(
      {
        kind: 'add',
        instrumentId,
        ...(position === undefined ? {} : { position }),
      },
      { kind: 'remove', instrumentId },
    );
  }

  remove(instrumentId: string): void {
    const position = this.ids().indexOf(instrumentId);
    if (position < 0) {
      return;
    }
    this.enqueue(
      { kind: 'remove', instrumentId },
      { kind: 'add', instrumentId, position },
    );
  }

  toggle(instrumentId: string): void {
    if (this.has(instrumentId)) {
      this.remove(instrumentId);
    } else {
      this.add(instrumentId);
    }
  }

  /** Applies an operation from an event (Undo or Retry). */
  apply(operation: WatchlistOperation): void {
    if (operation.kind === 'add') {
      this.add(operation.instrumentId, operation.position);
    } else {
      this.remove(operation.instrumentId);
    }
  }

  reload(): void {
    this.loaded.reload();
  }

  private enqueue(
    operation: WatchlistOperation,
    undo: WatchlistOperation,
  ): void {
    this.pending.update((ops) => [
      ...ops,
      { token: this.nextToken++, operation, undo },
    ]);
    this.persistOutbox();
    if (!this.network.online()) {
      this.hasQueuedChanges = true;
      this.eventStream.next({ type: 'queued', operation });
    }
  }

  /** Sends pending operations one by one, in order. */
  private async drain(): Promise<void> {
    if (this.sending) {
      return;
    }
    this.sending = true;
    let synced = 0;
    try {
      while (this.network.online()) {
        const next = this.pending()[0];
        const confirmed = this.confirmed();
        if (!next || confirmed === null) {
          break;
        }
        try {
          await this.send(next.operation);
          this.confirmed.set(apply(confirmed, next.operation));
          this.dequeue(next.token);
          synced++;
          this.eventStream.next({
            type: 'saved',
            operation: next.operation,
            undo: next.undo,
          });
        } catch (error) {
          if (!this.network.online()) {
            break; // Went offline mid-request: keep it queued and retry on reconnect.
          }
          this.dequeue(next.token);
          this.eventStream.next({
            type: 'failed',
            operation: next.operation,
            retryable: !isMarketDataError(error) || error.retryable,
          });
        }
      }
    } finally {
      this.sending = false;
    }
    if (this.hasQueuedChanges && synced > 0 && this.pending().length === 0) {
      this.hasQueuedChanges = false;
      this.eventStream.next({ type: 'synced', count: synced });
    }
  }

  private send(operation: WatchlistOperation): Promise<void> {
    return operation.kind === 'add'
      ? this.port.addToWatchlist(operation.instrumentId, operation.position)
      : this.port.removeFromWatchlist(operation.instrumentId);
  }

  private dequeue(token: number): void {
    this.pending.update((ops) => ops.filter((p) => p.token !== token));
    this.persistOutbox();
  }

  private persistOutbox(): void {
    try {
      this.storage.set(
        WATCHLIST_OUTBOX_KEY,
        JSON.stringify(
          this.pending().map((p) => ({ operation: p.operation, undo: p.undo })),
        ),
      );
    } catch {
      // Storage full or unavailable: the queue still works for this session.
    }
  }

  private restoreOutbox(): PendingOperation[] {
    try {
      const raw: unknown = JSON.parse(
        this.storage.get(WATCHLIST_OUTBOX_KEY) ?? '[]',
      );
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw
        .filter(
          (
            entry,
          ): entry is {
            operation: WatchlistOperation;
            undo: WatchlistOperation;
          } => isOperation(entry?.operation) && isOperation(entry?.undo),
        )
        .map((entry) => ({ token: this.nextToken++, ...entry }));
    } catch {
      return [];
    }
  }
}

function apply(
  ids: readonly string[],
  operation: WatchlistOperation,
): readonly string[] {
  if (operation.kind === 'remove') {
    return ids.filter((id) => id !== operation.instrumentId);
  }
  if (ids.includes(operation.instrumentId)) {
    return ids;
  }
  const at =
    operation.position === undefined
      ? ids.length
      : Math.min(Math.max(operation.position, 0), ids.length);
  return [...ids.slice(0, at), operation.instrumentId, ...ids.slice(at)];
}

function isOperation(value: unknown): value is WatchlistOperation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const op = value as Record<string, unknown>;
  return (
    (op['kind'] === 'add' || op['kind'] === 'remove') &&
    typeof op['instrumentId'] === 'string' &&
    INSTRUMENT_ID_PATTERN.test(op['instrumentId']) &&
    (op['position'] === undefined || typeof op['position'] === 'number')
  );
}
