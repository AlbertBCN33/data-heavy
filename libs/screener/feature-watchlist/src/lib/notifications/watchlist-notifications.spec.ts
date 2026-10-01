import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MarketDataStore,
  type WatchlistEvent,
  WatchlistStore,
} from '@data-heavy/data-access';
import { ToastService } from '@data-heavy/ui';
import { Subject } from 'rxjs';

import { WatchlistNotifications } from './watchlist-notifications';

function setup() {
  const events = new Subject<WatchlistEvent>();
  const store = { events, apply: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: WatchlistStore, useValue: store },
      {
        provide: MarketDataStore,
        useValue: { byId: signal(new Map([['NYSE:AAA', { symbol: 'AAA' }]])) },
      },
    ],
  });
  const notifications = TestBed.inject(WatchlistNotifications);
  notifications.start();
  notifications.start(); // idempotent
  const toasts = TestBed.inject(ToastService);
  return { events, store, toasts };
}

const add = { kind: 'add', instrumentId: 'NYSE:AAA' } as const;
const remove = { kind: 'remove', instrumentId: 'NYSE:AAA' } as const;

describe('WatchlistNotifications', () => {
  it('confirms a saved change once, with an undo', () => {
    const { events, store, toasts } = setup();
    events.next({ type: 'saved', operation: remove, undo: add });

    expect(toasts.toasts()).toHaveLength(1);
    const toast = toasts.toasts()[0];
    expect(toast).toMatchObject({
      kind: 'success',
      message: 'Removed AAA from your watchlist.',
    });
    toast?.action?.run();
    expect(store.apply).toHaveBeenCalledWith(add);
  });

  it('names additions too', () => {
    const { events, toasts } = setup();
    events.next({ type: 'saved', operation: add, undo: remove });
    expect(toasts.toasts()[0]?.message).toBe('Added AAA to your watchlist.');
  });

  it('reports failures, offering a retry only when it can help', () => {
    const { events, store, toasts } = setup();
    events.next({ type: 'failed', operation: add, retryable: true });
    events.next({ type: 'failed', operation: remove, retryable: false });

    const [retryable, final] = toasts.toasts();
    expect(retryable).toMatchObject({
      kind: 'error',
      message: "Couldn't add AAA. Your change was undone.",
    });
    retryable?.action?.run();
    expect(store.apply).toHaveBeenCalledWith(add);
    expect(final?.action).toBeUndefined();
  });

  it('explains offline changes and confirms the sync', () => {
    const { events, toasts } = setup();
    events.next({
      type: 'queued',
      operation: { kind: 'add', instrumentId: 'NYSE:ZZZ' },
    });
    events.next({ type: 'synced', count: 1 });
    events.next({ type: 'synced', count: 3 });

    expect(toasts.toasts().map((t) => t.message)).toEqual([
      "You're offline. NYSE:ZZZ will be added to your watchlist when you reconnect.",
      'Back online: 1 watchlist change saved.',
      'Back online: 3 watchlist changes saved.',
    ]);
  });

  it('stops listening when destroyed', () => {
    const { events, toasts } = setup();
    TestBed.resetTestingModule();
    events.next({ type: 'synced', count: 1 });
    expect(toasts.toasts()).toEqual([]);
  });
});
