# Market Screener (data-heavy)

A fast, accessible market screener for 10k+ equities and ETFs, built with Angular and Nx.

> Work in progress. The full README (problem, live demo, screenshots, decisions and quality
> numbers) is written once the features are in place.

## Getting started

Requires Node 24 (see `.nvmrc`).

```sh
nvm use
npm ci
npm start            # http://localhost:4200
```

## Commands

| Command                 | What it does                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| `npm start`             | Dev server for the `screener` app                                  |
| `npm run build`         | Production build                                                   |
| `npm test`              | Unit tests (Vitest) for all projects                               |
| `npm run lint`          | ESLint, including module boundary rules                            |
| `npm run typecheck`     | `ngc`/`tsc` type checks, including templates                       |
| `npm run e2e`           | Playwright journeys with axe checks                                |
| `npm run format:check`  | Prettier check                                                     |
| `npm run data:generate` | Regenerate the market data snapshot (also runs before build/serve) |
| `npm run lighthouse`    | Lighthouse CI against the production build (build first)           |
| `npm run perf:measure`  | Before/after performance measurements (build first)                |

## Data

The app runs on a **synthetic, deterministic** dataset of 10,000 equities and ETFs. Company names and
figures are generated and do not refer to real companies. See [tools/market-data](tools/market-data/README.md)
and [ADR 0006](docs/adr/0006-market-data-snapshot-and-adapters.md).

Add `?rows=50000` to load a 50,000-row stress dataset, and `?naive=1` to compare with a naive
implementation (every row in the DOM, filtering and sorting on the main thread). See
[docs/performance.md](docs/performance.md).

## Documentation

- [Architecture decision records](docs/adr/README.md)
- [Performance: targets, measurements and budgets](docs/performance.md)
- [Deployment](docs/deployment.md)
