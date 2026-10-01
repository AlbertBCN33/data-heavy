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

| Command                | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm start`            | Dev server for the `screener` app            |
| `npm run build`        | Production build                             |
| `npm test`             | Unit tests (Vitest) for all projects         |
| `npm run lint`         | ESLint, including module boundary rules      |
| `npm run typecheck`    | `ngc`/`tsc` type checks, including templates |
| `npm run e2e`          | Playwright journeys with axe checks          |
| `npm run format:check` | Prettier check                               |

## Documentation

- [Architecture decision records](docs/adr/README.md)
- [Deployment](docs/deployment.md)
