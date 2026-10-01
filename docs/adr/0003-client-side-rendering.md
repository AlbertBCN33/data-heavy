# 0003. Client-side rendering instead of SSR

- Status: Accepted
- Date: 2026-10-01

## Context

The screener behaves like a logged-in dashboard. The interesting content is personal and
interactive (filters, a watchlist), there is nothing to index for SEO, and the whole dataset is
loaded and processed on the client. Hosting has to stay on Firebase Hosting's free plan.

| Option                    | Pros                                                                                     | Cons                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSR** (static SPA)      | Free static hosting. Simplest mental model. Web Worker and IndexedDB work without guards | Blank page until JS loads. LCP depends on the bundle size                                                                                                                               |
| SSR (Angular SSR)         | Fast first paint. SEO                                                                    | Needs a server (Cloud Functions or Cloud Run, which need the paid Blaze plan). Hydrating a virtualized, worker-fed table adds complexity for little gain when there is nothing to index |
| Prerender (SSG) the shell | Static hosting, faster first paint of the shell                                          | Only the empty shell can be prerendered. Data-dependent views still render on the client                                                                                                |

## Decision

Ship a client-side-rendered SPA served as static files. Make the first paint cheap instead:
a small initial bundle, skeletons that match the final layout (no CLS), lazy routes, and data
loaded in parallel with the code.

## Consequences

- Hosting stays free and deployments are just static file uploads.
- LCP depends on the initial JS budget. That is why the budget is enforced in the build and checked
  by Lighthouse CI.
- Prerendering the shell is still possible later without architectural changes, provided
  browser-only APIs (Worker, IndexedDB, `navigator.onLine`) stay behind injectable services.
