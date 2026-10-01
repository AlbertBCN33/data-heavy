import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  KEY_VALUE_STORAGE,
  type KeyValueStorage,
  memoryStorage,
} from '../key-value-storage';
import { MarketDataError } from '../market-data-error';
import { MarketDataPort } from '../market-data.port';
import { NetworkStatus } from '../network/network-status';
import {
  WATCHLIST_OUTBOX_KEY,
  type WatchlistEvent,
  WatchlistStore,
} from './watchlist.store';

interface Call {
  readonly method: 'add' | 'remove';
  readonly id: string;
  readonly position?: number;
  resolve(): void;
  reject(error: unknown): void;
}

/** A port whose writes stay pending until the test settles them. */
class ControlledPort extends MarketDataPort {
  initial: string[] = ['NYSE:AAA', 'NYSE:BBB'];
  readonly calls: Call[] = [];
  override getWatchlist = vi.fn(async () => [...this.initial]);
  override loadMarketData = vi.fn();
  override getPriceHistory = vi.fn();
  override addToWatchlist(id: string, position?: number) {
    return new Promise<void>((resolve, reject) =>
      this.calls.push({ method: 'add', id, position, resolve, reject }),
    );
  }
  override removeFromWatchlist(id: string) {
    return new Promise<void>((resolve, reject) =>
      this.calls.push({ method: 'remove', id, resolve, reject }),
    );
  }
}

function setup(storage: KeyValueStorage = memoryStorage(), online = true) {
  const port = new ControlledPort();
  let isOnline = online;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => isOnline);
  TestBed.configureTestingModule({
    providers: [
      { provide: MarketDataPort, useValue: port },
      { provide: KEY_VALUE_STORAGE, useValue: storage },
    ],
  });
  const store = TestBed.inject(WatchlistStore);
  TestBed.inject(NetworkStatus);
  const events: WatchlistEvent[] = [];
  store.events.subscribe((e) => events.push(e));
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise((r) => setTimeout(r));
    }
  };
  const setOnline = (value: boolean) => {
    isOnline = value;
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  };
  return { store, port, events, settle, setOnline, storage };
}

describe('WatchlistStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the saved watchlist', async () => {
    const { store, settle } = setup();
    expect(store.status()).toBe('loading');
    await settle();
    expect(store.status()).toBe('ready');
    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB']);
    expect(store.has('NYSE:AAA')).toBe(true);
  });

  it('shows an addition immediately and confirms it once saved', async () => {
    const { store, port, events, settle } = setup();
    await settle();

    store.add('NYSE:CCC');
    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB', 'NYSE:CCC']);
    await settle();
    expect(port.calls.map((c) => [c.method, c.id])).toEqual([
      ['add', 'NYSE:CCC'],
    ]);

    port.calls[0]?.resolve();
    await settle();
    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB', 'NYSE:CCC']);
    expect(events).toEqual([
      {
        type: 'saved',
        operation: { kind: 'add', instrumentId: 'NYSE:CCC' },
        undo: { kind: 'remove', instrumentId: 'NYSE:CCC' },
      },
    ]);
  });

  it('rolls back a failed change and reports whether it can be retried', async () => {
    const { store, port, events, settle } = setup();
    await settle();

    store.remove('NYSE:AAA');
    expect(store.ids()).toEqual(['NYSE:BBB']);
    await settle();
    port.calls[0]?.reject(new MarketDataError('network', 'timeout'));
    await settle();

    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB']);
    expect(events).toEqual([
      {
        type: 'failed',
        operation: { kind: 'remove', instrumentId: 'NYSE:AAA' },
        retryable: true,
      },
    ]);
  });

  it('marks failures that cannot be retried', async () => {
    const { store, port, events, settle } = setup();
    await settle();
    store.add('NYSE:CCC');
    await settle();
    port.calls[0]?.reject(new MarketDataError('invalid-data', 'bad'));
    await settle();
    expect(events[0]).toMatchObject({ type: 'failed', retryable: false });
  });

  it('sends changes one at a time, in order', async () => {
    const { store, port, settle } = setup();
    await settle();

    store.add('NYSE:CCC');
    store.remove('NYSE:AAA');
    await settle();
    expect(port.calls).toHaveLength(1);

    port.calls[0]?.resolve();
    await settle();
    expect(port.calls.map((c) => [c.method, c.id])).toEqual([
      ['add', 'NYSE:CCC'],
      ['remove', 'NYSE:AAA'],
    ]);
    port.calls[1]?.resolve();
    await settle();
    expect(store.ids()).toEqual(['NYSE:BBB', 'NYSE:CCC']);
  });

  it('offers an undo that restores a removed item to its position', async () => {
    const { store, port, events, settle } = setup();
    await settle();

    store.remove('NYSE:AAA');
    await settle();
    port.calls[0]?.resolve();
    await settle();

    const saved = events[0];
    expect(saved?.type).toBe('saved');
    if (saved?.type !== 'saved') return;
    store.apply(saved.undo);
    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB']);
    await settle();
    expect(port.calls[1]).toMatchObject({
      method: 'add',
      id: 'NYSE:AAA',
      position: 0,
    });
  });

  it('ignores duplicate adds, unknown removes and malformed ids', async () => {
    const { store, port, settle } = setup();
    await settle();
    store.add('NYSE:AAA');
    store.remove('NYSE:ZZZ');
    store.add('not an id');
    await settle();
    expect(port.calls).toEqual([]);
  });

  it('toggles membership', async () => {
    const { store, settle } = setup();
    await settle();
    store.toggle('NYSE:AAA');
    store.toggle('NYSE:CCC');
    expect(store.ids()).toEqual(['NYSE:BBB', 'NYSE:CCC']);
  });

  describe('offline', () => {
    it('keeps changes locally, persists them and syncs on reconnect', async () => {
      const storage = memoryStorage();
      const { store, port, events, settle, setOnline } = setup(storage);
      await settle();
      setOnline(false);

      store.add('NYSE:CCC');
      store.remove('NYSE:BBB');
      await settle();
      expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:CCC']);
      expect(store.queuedCount()).toBe(2);
      expect(port.calls).toEqual([]);
      expect(events.map((e) => e.type)).toEqual(['queued', 'queued']);
      expect(
        JSON.parse(storage.get(WATCHLIST_OUTBOX_KEY) ?? '[]'),
      ).toHaveLength(2);

      setOnline(true);
      await settle();
      port.calls[0]?.resolve();
      await settle();
      port.calls[1]?.resolve();
      await settle();

      expect(store.queuedCount()).toBe(0);
      expect(events.at(-1)).toEqual({ type: 'synced', count: 2 });
      expect(JSON.parse(storage.get(WATCHLIST_OUTBOX_KEY) ?? '[]')).toEqual([]);
    });

    it('restores queued changes after a reload', async () => {
      const storage = memoryStorage({
        [WATCHLIST_OUTBOX_KEY]: JSON.stringify([
          {
            operation: { kind: 'add', instrumentId: 'NYSE:CCC' },
            undo: { kind: 'remove', instrumentId: 'NYSE:CCC' },
          },
          { operation: { kind: 'oops' }, undo: {} },
        ]),
      });
      const { store, port, events, settle } = setup(storage);
      await settle();
      expect(store.ids()).toContain('NYSE:CCC');
      port.calls[0]?.resolve();
      await settle();
      expect(events.at(-1)).toEqual({ type: 'synced', count: 1 });
    });

    it('keeps a change queued if the connection drops mid-request', async () => {
      const { store, port, events, settle, setOnline } = setup();
      await settle();
      store.add('NYSE:CCC');
      await settle();
      setOnline(false);
      port.calls[0]?.reject(new MarketDataError('network', 'offline'));
      await settle();

      expect(store.ids()).toContain('NYSE:CCC');
      expect(events.filter((e) => e.type === 'failed')).toEqual([]);

      setOnline(true);
      await settle();
      expect(port.calls).toHaveLength(2);
    });

    it('ignores a corrupt outbox', () => {
      const { store } = setup(
        memoryStorage({ [WATCHLIST_OUTBOX_KEY]: '{nope' }),
      );
      expect(store.queuedCount()).toBe(0);
      const { store: other } =
        (TestBed.resetTestingModule(),
        setup(memoryStorage({ [WATCHLIST_OUTBOX_KEY]: '{}' })));
      expect(other.ids()).toEqual([]);
      expect(store).toBeDefined();
    });

    it('still works when the outbox cannot be written', async () => {
      const failing: KeyValueStorage = {
        get: () => null,
        set: () => {
          throw new Error('QuotaExceededError');
        },
      };
      const { store, settle } = setup(failing);
      await settle();
      store.add('NYSE:CCC');
      expect(store.ids()).toContain('NYSE:CCC');
    });
  });

  it('reports a failed initial load and recovers on reload', async () => {
    const port = new ControlledPort();
    port.getWatchlist.mockRejectedValueOnce(
      new MarketDataError('network', 'down'),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: MarketDataPort, useValue: port },
        { provide: KEY_VALUE_STORAGE, useValue: memoryStorage() },
      ],
    });
    const store = TestBed.inject(WatchlistStore);
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await TestBed.inject(ApplicationRef).whenStable();
        await new Promise((r) => setTimeout(r));
      }
    };
    await settle();
    expect(store.status()).toBe('error');

    store.reload();
    await settle();
    expect(store.status()).toBe('ready');
    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB']);
  });

  it('keeps the known list when a later reload fails', async () => {
    const { store, port, settle } = setup();
    await settle();
    port.getWatchlist.mockRejectedValueOnce(
      new MarketDataError('network', 'down'),
    );
    store.reload();
    await settle();
    expect(store.status()).toBe('ready');
    expect(store.ids()).toEqual(['NYSE:AAA', 'NYSE:BBB']);
  });
});
