# 0005. Continuous integration

- Status: Accepted
- Date: 2026-10-01

## Context

Every change must be checked for formatting, lint (including module boundaries), types, unit
tests, a production build and accessibility-checked end-to-end journeys. CI should stay fast as
the workspace grows and must not need paid services.

## Decision

A single GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pull requests and on pushes
to `main`:

1. `nx format:check` on the whole repository (fast and not worth scoping).
2. `nx affected -t lint typecheck test build`. Only projects touched by the change, and their
   dependents, are checked. `nrwl/nx-set-shas` uses the last _successful_ run on `main` as the base,
   so a red `main` does not hide breakage.
3. `nx affected -t e2e` against the **production build** served statically, with axe checks
   inside the specs. Playwright browsers are only installed when an e2e project is affected.

Caching:

| What                | How                                                                              |
| ------------------- | -------------------------------------------------------------------------------- |
| npm downloads       | `actions/setup-node` with `cache: npm`, keyed on `package-lock.json`             |
| Nx task results     | `actions/cache` on `.nx/cache`, keyed on lockfile + commit, restoring the latest |
| Playwright browsers | `actions/cache` keyed on the installed Playwright version                        |

Hardening:

- Third-party actions are pinned to **full commit SHAs** (with the version in a comment), and Dependabot keeps
  them current. A moved tag cannot change what runs.
- The workflow token is read-only (`contents: read`, plus `actions: read` for `nx-set-shas`).
- Superseded runs on the same branch or PR are cancelled.

Nx Cloud (remote cache, distributed tasks) is **not** used. It would speed up CI but adds an
external service and account for little gain at this size. Using it later is a change to `nx.json`
and the workflow, nothing else.

## Consequences

- PR feedback time grows with the size of the change, not the size of the repository.
- The local Nx cache in GitHub's cache storage is per-branch with fallback to `main`. It is less
  effective than a remote cache shared by every machine, which is acceptable here.
- One job keeps the setup simple. If e2e grows slow it can move to its own job, with shards,
  that consumes the build as an artifact.
