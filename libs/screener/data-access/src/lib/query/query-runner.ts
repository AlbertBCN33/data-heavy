import {
  DestroyRef,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';
import type { Instrument, ScreenerQuery } from '@data-heavy/util';

import {
  createQueryHandler,
  type QueryRequest,
  type QueryResponse,
} from './query-protocol';

/** The subset of `Worker` the runner uses; lets tests provide a fake. */
export interface QueryWorker {
  postMessage(message: QueryRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<QueryResponse>) => void) | null;
  onerror: ((event: Event) => void) | null;
}

/** Creates the worker, or returns `null` where workers are unavailable (SSR, tests). */
export const QUERY_WORKER_FACTORY = new InjectionToken<
  () => QueryWorker | null
>('QUERY_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => () =>
    typeof Worker === 'undefined'
      ? null
      : (new Worker(new URL('./query.worker', import.meta.url), {
          type: 'module',
        }) as unknown as QueryWorker),
});

export interface QueryResult {
  /** The dataset the indexes refer to; use it to resolve rows, never a newer one. */
  readonly dataset: readonly Instrument[];
  /** Matching row indexes into `dataset`, in display order. */
  readonly indexes: Uint32Array;
  /** Time spent filtering and sorting (excludes messaging). */
  readonly durationMs: number;
  readonly onWorker: boolean;
}

/**
 * Runs screener queries in a Web Worker and exposes the latest result as a signal.
 *
 * - The dataset is posted once; each query only posts the small query object.
 * - Only one query is in flight. Newer submissions replace the queued one ("latest wins"), so
 *   fast typing never builds a backlog and stale results are never shown.
 * - Without worker support, or after a worker crash, the same handler runs on the main thread.
 *
 * Provide it per page (not in root) so the worker is terminated when the page is destroyed.
 */
@Injectable()
export class QueryRunner {
  private readonly createWorker = inject(QUERY_WORKER_FACTORY);

  private readonly latest = signal<QueryResult | null>(null);
  private readonly running = signal(false);
  private readonly usingWorker = signal(false);

  /** Latest completed result for the current dataset; `null` before the first one. */
  readonly result = this.latest.asReadonly();
  /** `true` while a query is being computed (the previous result stays visible). */
  readonly busy = this.running.asReadonly();
  readonly onWorker = this.usingWorker.asReadonly();

  private worker: QueryWorker | null = null;
  private fallback: ((request: QueryRequest) => void) | null = null;
  private dataset: readonly Instrument[] | null = null;
  private nextId = 1;
  private inFlight: { id: number; query: ScreenerQuery } | null = null;
  private queued: ScreenerQuery | null = null;
  private lastQuery: ScreenerQuery | null = null;

  constructor() {
    this.worker = this.createWorker();
    if (this.worker) {
      this.worker.onmessage = (event) => this.onResponse(event.data, true);
      this.worker.onerror = () => this.switchToMainThread();
      this.usingWorker.set(true);
    }
    inject(DestroyRef).onDestroy(() => this.worker?.terminate());
  }

  /** Replaces the dataset and re-runs the last query against it. */
  setDataset(rows: readonly Instrument[]): void {
    this.dataset = rows;
    this.latest.set(null);
    this.inFlight = null;
    this.queued = null;
    this.send({ type: 'load', rows });
    if (this.lastQuery) {
      this.dispatch(this.lastQuery);
    }
  }

  submit(query: ScreenerQuery): void {
    this.lastQuery = query;
    if (!this.dataset) {
      return;
    }
    if (this.inFlight) {
      this.queued = query;
      return;
    }
    this.dispatch(query);
  }

  private dispatch(query: ScreenerQuery): void {
    const id = this.nextId++;
    this.inFlight = { id, query };
    this.running.set(true);
    this.send({ type: 'query', id, query });
  }

  private send(request: QueryRequest): void {
    if (this.worker) {
      this.worker.postMessage(request);
    } else {
      this.mainThreadHandler()(request);
    }
  }

  private onResponse(response: QueryResponse, onWorker: boolean): void {
    if (!this.inFlight || response.id !== this.inFlight.id || !this.dataset) {
      return; // Superseded by a new dataset.
    }
    this.inFlight = null;
    if (response.type === 'result') {
      this.latest.set({
        dataset: this.dataset,
        indexes: response.indexes,
        durationMs: response.durationMs,
        onWorker,
      });
    }
    const next = this.queued;
    this.queued = null;
    if (next) {
      this.dispatch(next);
    } else {
      this.running.set(false);
    }
  }

  private switchToMainThread(): void {
    this.worker?.terminate();
    this.worker = null;
    this.usingWorker.set(false);
    const retry = this.inFlight?.query ?? this.lastQuery;
    this.inFlight = null;
    if (this.dataset) {
      this.send({ type: 'load', rows: this.dataset });
    }
    if (retry && this.dataset) {
      this.dispatch(retry);
    }
  }

  private mainThreadHandler(): (request: QueryRequest) => void {
    // Responses are delivered asynchronously, like worker messages, so callers behave the same.
    this.fallback ??= createQueryHandler((response) =>
      queueMicrotask(() => this.onResponse(response, false)),
    );
    return this.fallback;
  }
}
