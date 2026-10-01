# 0009. Filter and sort in a Web Worker

- Status: Accepted
- Date: 2026-10-01

## Context

Every filter or sort change re-evaluates the whole dataset (10k rows, 50k in stress mode). The
interaction budget is INP < 200 ms on a mid-tier phone. The dataset is static and already in the
browser (see [ADR 0006](0006-market-data-snapshot-and-adapters.md)).

Query engine timings (`createQueryEngine` from `@data-heavy/util`, median of 25 runs, Node 24 on an
i7-14700KF desktop; a mid-tier phone is typically 4–6× slower):

| Query                                  | 10k rows | 50k rows |
| -------------------------------------- | -------- | -------- |
| Default sort (market cap)              | 1.7 ms   | 11.1 ms  |
| Text search                            | 0.3 ms   | 1.6 ms   |
| Range + select filters, 3-key sort     | 0.8 ms   | 5.0 ms   |
| Sort by name (locale-aware collation)  | 7.0 ms   | 44.2 ms  |
| One-off: build engine                  | 4.6 ms   | 17.6 ms  |
| One-off: `structuredClone` of the rows | 14.8 ms  | 73.4 ms  |

On a phone, a name sort over 50k rows takes about 180–260 ms of main-thread time. That alone
breaks the INP budget, before any rendering.

Options considered:

| Option         | Pros                                                                          | Cons                                                                                                        |
| -------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Main thread    | Simplest. No messaging                                                        | Long tasks on slow devices at 50k rows. Typing in the search box would stutter                              |
| **Web Worker** | Main thread only renders. Fast queries stay fast, slow ones never block input | One-off cost to copy the dataset (~15 ms at 10k). Messaging and lifecycle code. Workers need a fallback     |
| Server         | Scales to millions of rows. Small client                                      | Needs a backend (none here, see ADR 0006). Network latency on every keystroke. No offline. Not free to host |

## Decision

Run the query engine in a dedicated Web Worker (`data-access/src/lib/query`):

- **Protocol.** The dataset is posted once (`load`). Each query posts only the small query object,
  and the worker answers with a `Uint32Array` of row indexes whose buffer is **transferred**, not
  copied. The table maps indexes to rows from its own copy of the dataset.
- **Latest wins.** At most one query is in flight. While it runs, newer submissions replace the
  queued one, so a burst of keystrokes costs at most two queries and stale results are never shown.
- **Consistency.** Each result carries the dataset it indexes into, so a reload can never mix rows
  from two datasets.
- **Fallback.** Without `Worker` (tests, SSR) or after a worker crash, the _same_ handler runs on
  the main thread with asynchronous delivery, so callers behave the same.
- **Lifecycle.** `QueryRunner` is provided by the screener page and terminates the worker when the
  page is destroyed.
- The engine pre-computes typed numeric columns and lower-cased search text once per dataset
  and sorts index arrays rather than objects.

## Consequences

- Filtering and sorting never block input, even in stress mode. The worker chunk is 1.3 kB.
- The main thread pays the dataset copy once (~15 ms at 10k, ~73 ms at 50k). For the 50k stress
  mode, generating the rows inside the worker would avoid even that. Considered when stress mode
  is built.
- The protocol handler is a pure function, unit-tested without a worker. The worker entry file is
  a few lines of wiring and is excluded from coverage.
- A server would become the right answer once the dataset no longer fits comfortably in the
  browser. The `MarketDataPort` boundary leaves room for that.
