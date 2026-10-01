# 0007. State management with signal-based services

- Status: Accepted
- Date: 2026-10-01

## Context

The app holds a few clearly bounded pieces of state:

- **The view** (filters, sort, columns, selection). The URL is its source of truth
  (decoded and encoded by the URL codec in `util`).
- **Market data and query results.** Loaded once, then derived from the view by the query engine
  (in a worker, see the upcoming worker ADR).
- **The watchlist.** Optimistic updates with rollback and undo.
- **Async resources** such as price history for the selected instrument.

Options considered:

| Option                        | Pros                                                                                                                         | Cons                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Signal-based services**     | Built into Angular. `signal`/`computed`/`linkedSignal`/`resource` cover derived and async state. No dependency. Easy to test | Conventions are up to the team (this ADR sets them)                                                                            |
| `@ngrx/signals` (SignalStore) | Consistent store shape, plugins (entities, devtools), good for many teams                                                    | Another dependency and API to learn. Its main benefits (shared conventions across many stores) don't show up with three stores |
| `@ngrx/store` (Redux)         | Strong traceability, devtools, effects                                                                                       | A lot of ceremony for this size. Duplicates what the URL and signals already give                                              |

## Decision

Use **plain signal-based services** in `data-access`, following these conventions:

- One `@Injectable` store per concern (`WatchlistStore`, `ScreenerStore`, …). State is held in
  private `signal`s and exposed as read-only `Signal`s or `computed`s. Mutations go through
  methods only.
- Derived state uses `computed`. Async reads use `resource()` with the port's `AbortSignal`
  support, so superseded requests are cancelled.
- The URL is not mirrored into a second store. A small router-bound service decodes it into a
  `Signal<ScreenerView>` and writes changes back through the router, so back/forward and shared
  links just work.
- Stores depend on `MarketDataPort`, never on a concrete adapter.

## Consequences

- Zero extra dependencies, and the state code reads like the Angular docs.
- No time-travel devtools. Acceptable: the URL already makes view state reproducible, and the
  stores are small enough to unit-test directly.
- If the number of stores or teams grows, migrating a store to `@ngrx/signals` is local, because
  consumers only see signals and methods.
