import { TestBed } from '@angular/core/testing';
import { generateInstruments, type ScreenerQuery } from '@data-heavy/util';

import {
  createQueryHandler,
  type QueryRequest,
  type QueryResponse,
} from './query-protocol';
import { QueryRunner } from './query-runner';
import { QUERY_WORKER_FACTORY, type QueryWorker } from './query-worker-factory';

const rows = generateInstruments(4, 40);
const query = (text = ''): ScreenerQuery => ({
  text,
  ranges: {},
  selects: {},
  sort: [],
});

/** A worker whose responses are released manually, to control timing in tests. */
class FakeWorker implements QueryWorker {
  readonly requests: QueryRequest[] = [];
  readonly pending: QueryResponse[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<QueryResponse>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly handle = createQueryHandler((r) => this.pending.push(r));

  postMessage(request: QueryRequest): void {
    this.requests.push(request);
    this.handle(request);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Delivers the oldest pending response. */
  respond(): void {
    const response = this.pending.shift();
    if (response) {
      this.onmessage?.({ data: response } as MessageEvent<QueryResponse>);
    }
  }
  queries(): string[] {
    return this.requests.flatMap((r) =>
      r.type === 'query' ? [r.query.text] : [],
    );
  }
}

function withWorker() {
  const worker = new FakeWorker();
  TestBed.configureTestingModule({
    providers: [
      QueryRunner,
      { provide: QUERY_WORKER_FACTORY, useValue: () => worker },
    ],
  });
  return { worker, runner: TestBed.inject(QueryRunner) };
}

function withoutWorker() {
  TestBed.configureTestingModule({
    providers: [
      QueryRunner,
      { provide: QUERY_WORKER_FACTORY, useValue: () => null },
    ],
  });
  return TestBed.inject(QueryRunner);
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('QueryRunner', () => {
  describe('with a worker', () => {
    it('posts the dataset once and then only queries', () => {
      const { worker, runner } = withWorker();
      expect(runner.onWorker()).toBe(true);
      runner.setDataset(rows);
      runner.submit(query('a'));
      runner.submit(query('b'));
      expect(worker.requests.filter((r) => r.type === 'load')).toHaveLength(1);
    });

    it('waits for a dataset before running queries', () => {
      const { worker, runner } = withWorker();
      runner.submit(query('early'));
      expect(worker.queries()).toEqual([]);

      runner.setDataset(rows);
      expect(worker.queries()).toEqual(['early']);
    });

    it('keeps one query in flight and runs only the latest queued one', () => {
      const { worker, runner } = withWorker();
      runner.setDataset(rows);
      runner.submit(query('a'));
      runner.submit(query('b'));
      runner.submit(query('c'));
      expect(runner.busy()).toBe(true);

      worker.respond();
      expect(worker.queries()).toEqual(['a', 'c']);
      expect(runner.busy()).toBe(true);

      worker.respond();
      expect(runner.busy()).toBe(false);
      expect(runner.result()?.onWorker).toBe(true);
      expect(runner.result()?.dataset).toBe(rows);
    });

    it('ignores responses for a replaced dataset', () => {
      const { worker, runner } = withWorker();
      runner.setDataset(rows);
      runner.submit(query());
      const replacement = rows.slice(0, 5);
      runner.setDataset(replacement); // re-runs the last query

      worker.respond(); // stale response for the old dataset
      expect(runner.result()).toBeNull();
      worker.respond();
      expect(runner.result()?.dataset).toBe(replacement);
      expect(runner.result()?.indexes).toHaveLength(5);
    });

    it('keeps the previous result when a query fails', () => {
      const { worker, runner } = withWorker();
      runner.setDataset(rows);
      runner.submit(query());
      worker.respond();
      const previous = runner.result();

      runner.submit({
        ...query(),
        sort: [{ key: 'nope' as never, dir: 'asc' }],
      });
      worker.respond();
      expect(runner.result()).toBe(previous);
      expect(runner.busy()).toBe(false);
    });

    it('falls back to the main thread when the worker crashes', async () => {
      const { worker, runner } = withWorker();
      runner.setDataset(rows);
      runner.submit(query());
      worker.onerror?.(new Event('error'));

      expect(worker.terminated).toBe(true);
      expect(runner.onWorker()).toBe(false);
      await flush();
      expect(runner.result()?.onWorker).toBe(false);
      expect(runner.result()?.indexes).toHaveLength(40);
    });

    it('terminates the worker when destroyed', () => {
      const { worker } = withWorker();
      TestBed.resetTestingModule();
      expect(worker.terminated).toBe(true);
    });
  });

  describe('without worker support', () => {
    it('runs queries on the main thread, asynchronously', async () => {
      const runner = withoutWorker();
      expect(runner.onWorker()).toBe(false);
      runner.setDataset(rows);
      runner.submit(query());
      expect(runner.result()).toBeNull();

      await flush();
      expect(runner.result()?.indexes).toHaveLength(40);
      expect(runner.busy()).toBe(false);
    });

    it('recovers after a crash with nothing in flight', () => {
      const { worker, runner } = withWorker();
      worker.onerror?.(new Event('error'));
      expect(runner.onWorker()).toBe(false);
      expect(runner.result()).toBeNull();
    });
  });
});
