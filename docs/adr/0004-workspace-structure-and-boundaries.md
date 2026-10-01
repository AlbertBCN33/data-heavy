# 0004. Workspace structure and module boundaries

- Status: Accepted
- Date: 2026-10-01

## Context

The app is small enough to be one Angular project, but the goal is to show how a codebase stays
maintainable as teams and features grow: explicit layers, enforced dependencies, and code that can
be tested in isolation.

## Decision

One deployable app and focused, non-buildable libraries, all generated with Nx generators:

| Project             | Tag                | Responsibility                                             |
| ------------------- | ------------------ | ---------------------------------------------------------- |
| `screener`          | `type:app`         | Shell, routing, layout, i18n wiring. Composes features     |
| `e2e-screener`      | `type:e2e`         | Playwright journeys for `screener`, in `apps/screener/e2e` |
| `feature-screener`  | `type:feature`     | Table, filter panel, column picker                         |
| `feature-detail`    | `type:feature`     | Instrument detail drawer and chart                         |
| `feature-watchlist` | `type:feature`     | Watchlist with optimistic updates                          |
| `data-access`       | `type:data-access` | `MarketDataPort`, adapters, caching, signal-based state    |
| `ui`                | `type:ui`          | Accessible presentational components                       |
| `util`              | `type:util`        | Pure helpers: formatting, filter/sort engine, URL codec    |

Dependency rules, enforced by `@nx/enforce-module-boundaries` in `eslint.config.mjs`:

```text
app ──► feature ──► data-access ──► util
           │                          ▲
           └──────► ui ───────────────┘
```

- **Features cannot import other features.** Cross-feature flows (such as opening the detail drawer
  from a table row) go through the router or shared state in `data-access`.
- **`ui` cannot import `data-access`.** Components receive data through inputs and report through
  outputs, so they stay reusable and easy to test.
- **`util` depends only on `util`.** Pure TypeScript, no Angular, high test coverage.
- **Libraries are not buildable.** Nothing is published. The app build compiles library sources
  directly, so there is no extra build step to keep in sync. Nx still caches lint, test and typecheck
  per project.

## Consequences

- Breaking a layer fails `nx lint` locally and in CI, before it ever reaches code review.
- `nx affected` skips work for untouched libraries.
- More files (`project.json`, configs) than a single-project app would need. That cost is
  accepted because the structure is part of what the project demonstrates.

## Location of end-to-end tests

The e2e project lives inside the app it tests (`apps/screener/e2e`) rather than as a sibling under
`apps/`. Ownership is obvious from the path, and adding a second app later brings its own `e2e`
folder with it. It stays a separate Nx project (`e2e-screener`, tag `type:e2e`) with its own
Playwright ESLint config. The app's ESLint config ignores `e2e/**`, and Nx assigns files to the
innermost project, so a change to an e2e spec does not invalidate the app's cached build or tests.
