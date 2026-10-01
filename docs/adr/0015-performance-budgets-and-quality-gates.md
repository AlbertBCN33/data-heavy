# 0015. Performance budgets, quality gates and the browser matrix

- Status: Accepted
- Date: 2026-10-01

## Context

The targets are LCP < 2.5 s, INP < 200 ms and CLS < 0.1 on a mid-tier phone, plus WCAG 2.2 AA.
Until now, Chromium on desktop was the only browser in the tests and nothing measured the
targets, so a regression would only show up after release. Claims about speed also need numbers
behind them, so there has to be a repeatable way to produce them.

## Decision

**Gates in CI** (see [ADR 0005](0005-continuous-integration.md)):

| Gate                   | Where                        | Fails when                                                                           |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| Initial JS budget      | Angular build                | Initial bundle > 600 kB raw (warning at 560 kB)                                      |
| Component style budget | Angular build                | Any component stylesheet > 8 kB (warning at 4 kB)                                    |
| Lighthouse CI          | After the build, if affected | Median run: LCP > 2.5 s, CLS > 0.1, TBT > 200 ms, accessibility < 1, script > 180 kB |
| axe (WCAG 2.2 AA tags) | Inside the e2e journeys      | Any violation, in every browser of the matrix                                        |

- Lighthouse runs the mobile profile (simulated slow 4G, 4x CPU slowdown) three times per page on
  `/` and `/watchlist`, against the production build. TBT stands in for INP, which a page-load test
  cannot measure. The performance score is a warning only, because it mixes metrics that already
  have their own thresholds. Reports are uploaded as a CI artifact.
- The JS budget is derived from LCP: with the current 524 kB (134 kB Brotli) the screener's LCP is
  2.2 s, and the error threshold sits about 20 kB Brotli above that, where LCP would approach 2.5 s.
  [docs/performance.md](../performance.md) has the arithmetic.

**Decisions made to meet LCP**, each measured with Lighthouse before and after:

1. **The landing route is eager.** The screener is the entry page and every first visit
   needs it, so a lazy chunk only added a request to the critical chain. The watchlist route,
   the detail drawer with its chart (`@defer`), the watchlist notifications and the worker stay lazy.
2. **The default language is bundled.** English ships in the initial bundle through a custom
   translation loader. Other languages are fetched when chosen and prefetched by the service worker.
   This supersedes the "one JSON request before first render" consequence in
   [ADR 0014](0014-runtime-i18n-with-ngx-translate.md).
3. **The data fetch waits for the first contentful paint.** `MarketDataStore` starts loading
   the snapshot on the `first-contentful-paint` performance entry (300 ms fallback), so it does
   not compete with the first paint for bandwidth. The trigger is an injection token
   (`MARKET_DATA_LOAD_START`), so unit tests can start loading at once.
4. **Empty states don't wait for data they don't need.** An empty watchlist renders without
   waiting for the market snapshot.

**Before/after evidence:** the app keeps a naive mode (`?naive=1`: every row in the DOM,
filtering and sorting on the main thread) and a stress mode (`?rows=50000`). `tools/perf/measure.mjs`
measures both modes at both sizes with 4x CPU throttling. The naive mode is a measuring tool, not a
feature. It is not linked from the UI and shares the formatting and URL state, so the comparison
isolates the architecture.

**Browser matrix:**

| Run          | Browsers                                                             |
| ------------ | -------------------------------------------------------------------- |
| Pull request | Chromium (all journeys), Pixel 7 profile (journeys tagged `@mobile`) |
| `main`       | The above, plus Firefox and WebKit on all journeys                   |

Pull request feedback stays fast. `main` catches engine-specific problems before a deploy. The
mobile journeys check reflow at the device width and at 320 CSS px (WCAG 1.4.10), the collapsed
filters, the full-width drawer and axe. The service worker offline test is skipped on WebKit, where Playwright's
service worker support is not reliable.

## Consequences

- A change that slows the first paint, shifts layout or adds an accessibility violation fails CI
  instead of going live. Lighthouse makes CI slower whenever the app is affected (three runs per page).
- The performance numbers in the docs can be reproduced with two commands, and must be updated
  when they change.
- Lab data only. Without real-user monitoring, regressions specific to real devices or networks
  would go unnoticed. Adding `web-vitals` reporting would need an endpoint, which this project
  does not have.
- Starting the data fetch after the first paint adds up to a frame or two of time-to-data on
  fast connections, in exchange for more than a second of LCP on slow ones.
- Adding WebKit and Firefox found real defects: range filter drafts lost when a commit landed
  mid-typing (all browsers, exposed by WebKit timing), headers not focused on click, Enter not
  committing a number input, and a keyboard jump that WebKit undid when new results re-rendered
  the focused row. Each now has a test.
