# 0002. Stack and pinned versions

- Status: Accepted
- Date: 2026-10-01

## Context

The project should use current, supported tooling, and builds must be reproducible locally and
in CI. Versions were checked against the npm registry and nodejs.org on 2026-10-01.

## Decision

| Tool       | Version                   | Notes                                                                                    |
| ---------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| Node.js    | 24.21.0 (Active LTS)      | Pinned in `.nvmrc` and `engines`. Angular 22 requires `^22.22.3 \|\| ^24.15.0 \|\| >=26` |
| npm        | 11 (bundled with Node 24) | Package manager                                                                          |
| Angular    | 22.2.1 (tooling 22.2.0)   | Latest stable                                                                            |
| Nx         | 23.2.1                    | Latest stable. `@nx/angular` supports Angular `>=20 <23`                                 |
| TypeScript | 6.0.3                     | Version supported by Angular 22                                                          |
| Vitest     | 4.1.11                    | Unit tests, through AnalogJS 2.7.5                                                       |
| Playwright | 1.63.0                    | End-to-end tests, with `@axe-core/playwright` 4.13.0                                     |

- **Exact versions** in `package.json` (no `^` or `~`) plus the committed lockfile. This is an
  application, not a library, so there is no reason to float. Upgrades happen deliberately through
  `nx migrate`, each in its own commit.
- **Zoneless change detection.** It is stable and the default for new Angular apps, so `zone.js` is
  not installed. Components use `OnPush` and signals.
- **Strict TypeScript everywhere.** `strict`, `noUncheckedIndexedAccess`,
  `noPropertyAccessFromIndexSignature`, `noImplicitOverride` in `tsconfig.base.json`, and Angular
  `strictTemplates`. A `typecheck` target runs `ngc --noEmit`, which also type-checks templates,
  plus `tsc --noEmit` for specs.
- **Unit tests: Vitest through AnalogJS (`vitest-analog`) in every project.** Nx's default for the
  app is Angular's own `@angular/build:unit-test` (`vitest-angular`), but that runner only works
  with _buildable_ libraries. The libraries here are not buildable ([ADR 0004](0004-workspace-structure-and-boundaries.md)),
  so the Analog setup is the one Vitest option that covers the whole workspace with a single
  configuration shape. Analog was bumped from the generated 2.6.4 to 2.7.5 because 2.6.4 is
  incompatible with `@angular/build` 22.2 (`cache.has is not a function`).
- **TypeScript path aliases instead of npm workspaces** (`--workspaces=false`). This is Nx's
  long-standing setup for Angular, and nothing in this repo is published.
- **Nx inferred targets** (`@nx/eslint/plugin`, `@nx/vitest`, `@nx/playwright/plugin`) instead of
  the executors Nx 23 deprecates. Vite resolves path aliases natively (`resolve.tsconfigPaths`), so
  the deprecated `nxViteTsPaths` plugin and the `vite-tsconfig-paths` package are not used.

## Consequences

- Contributors must use Node 24 (`nvm use` reads `.nvmrc`).
- Pinned versions do not pick up patches automatically. Dependabot or a periodic `nx migrate`
  is needed to stay current.
- If Angular's native unit-test builder later supports non-buildable libraries, switching is a
  configuration change: the specs use only TestBed and Vitest APIs, which both setups share.
