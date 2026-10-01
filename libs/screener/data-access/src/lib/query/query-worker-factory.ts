import { InjectionToken } from '@angular/core';

import type { QueryRequest, QueryResponse } from './query-protocol';

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
