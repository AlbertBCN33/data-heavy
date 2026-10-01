import {
  createQueryEngine,
  type Instrument,
  type QueryEngine,
  type ScreenerQuery,
} from '@data-heavy/util';

/**
 * Messages between the main thread and the query worker. The dataset is sent once (`load`);
 * each query then only sends the small query object and gets back row indexes, whose buffer is
 * transferred rather than copied.
 */
export type QueryRequest =
  | { readonly type: 'load'; readonly rows: readonly Instrument[] }
  | {
      readonly type: 'query';
      readonly id: number;
      readonly query: ScreenerQuery;
    };

export type QueryResponse =
  | {
      readonly type: 'result';
      readonly id: number;
      readonly indexes: Uint32Array;
      readonly durationMs: number;
    }
  | { readonly type: 'error'; readonly id: number; readonly message: string };

export type PostResponse = (
  response: QueryResponse,
  transfer: Transferable[],
) => void;

/**
 * The worker's message handler, independent of the worker global scope so it can be unit-tested
 * and reused as the main-thread fallback.
 */
export function createQueryHandler(
  post: PostResponse,
  now: () => number = () => performance.now(),
): (request: QueryRequest) => void {
  let engine: QueryEngine | null = null;

  return (request) => {
    if (request.type === 'load') {
      engine = createQueryEngine(request.rows);
      return;
    }
    if (!engine) {
      post({ type: 'error', id: request.id, message: 'No dataset loaded' }, []);
      return;
    }
    const started = now();
    try {
      const indexes = engine.run(request.query);
      post(
        {
          type: 'result',
          id: request.id,
          indexes,
          durationMs: now() - started,
        },
        [indexes.buffer],
      );
    } catch (error) {
      post(
        {
          type: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        },
        [],
      );
    }
  };
}
