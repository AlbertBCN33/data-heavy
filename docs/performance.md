# Performance

What the app is measured against, how, and the numbers. Every figure here was measured on the
production build. Rerun the measurements with the commands below and update this page rather than
quoting numbers from memory. Decisions are in [ADR 0015](adr/0015-performance-budgets-and-quality-gates.md).

## Targets

| Metric | Target   | Profile                                                           |
| ------ | -------- | ----------------------------------------------------------------- |
| LCP    | < 2.5 s  | Mid-tier phone: Lighthouse mobile (slow 4G, 4x CPU slowdown)      |
| INP    | < 200 ms | Mid-tier phone: 4x CPU slowdown, interactions on the full dataset |
| CLS    | < 0.1    | Same as LCP                                                       |

All numbers here come from lab tools. A lab run is repeatable and fails CI before users notice; it is
not field data. The app has no real-user monitoring (it is a portfolio project with no backend);
with one, `web-vitals` reporting to an endpoint would be the next step.

## Before and after: the screener with 10k and 50k rows

The "before" is a deliberately naive version of the same screen, kept in the app behind `?naive=1`:
a plain `<table>` with every row in the DOM, and filtering and sorting on the main thread. Same data,
same formatting, same URL state. The "after" is the shipped design: a virtualized grid
([ADR 0010](adr/0010-virtualized-accessible-grid.md)) and the query worker
([ADR 0009](adr/0009-filter-and-sort-in-a-web-worker.md)). `?rows=50000` loads a 50k-row snapshot
for a stress test.

Chromium (Playwright), production build, CPU throttled 4x, 1280×800, median of 3 runs.

| Measure                                | After, 10k | Before, 10k | After, 50k | Before, 50k |
| -------------------------------------- | ---------: | ----------: | ---------: | ----------: |
| Rows on screen after load              |     842 ms |     6206 ms |    1168 ms |    29072 ms |
| Longest main-thread task during load   |     241 ms |     4967 ms |     231 ms |    25569 ms |
| DOM elements                           |        660 |     100 187 |        660 |     500 187 |
| Sort: click until the order changes    |     110 ms |     4041 ms |     109 ms |    19233 ms |
| Sort: worst event duration (INP proxy) |      32 ms |     3912 ms |      24 ms |    18808 ms |
| Typing in search: worst event duration |      24 ms |     1568 ms |      16 ms |     4384 ms |
| Scrolling: 95th percentile frame       |      17 ms |      300 ms |      17 ms |     1567 ms |
| Scrolling: frames over 50 ms           |         0% |         15% |         0% |         17% |
| Scrolling: long tasks                  |          0 |          29 |          0 |          32 |

How to read it:

- **Interactions stay flat as the data grows.** After the change, sorting and typing cost the same at
  50k rows as at 10k (24 ms worst event, well under the 200 ms INP budget). Before, a single sort
  blocked the main thread for 3.6 s at 10k and 19 s at 50k.
- **The DOM is constant.** 660 elements whatever the row count, against 100k and 500k.
- **Scrolling holds 60 fps** (17 ms frames) in the virtualized grid.
- **What remains on the main thread is start-up.** After the change, the longest task during load
  is Angular bootstrapping and rendering the shell (about 230 ms at 4x CPU, before the first
  paint). Handling the snapshot once it arrives takes 54 ms at 10k and 213 ms at 50k, mostly
  posting the dataset to the worker and laying out the grid. Transferring columns to the worker
  instead of structured-cloning objects would cut the 50k case further. It is not needed for the
  10k dataset the app ships.
- **Profiling found one avoidable cost.** Decoding the snapshot spread an object per row
  (`...EXCHANGE_INFO[exchange]`), which the production build compiles to a slow
  property-descriptor helper. That alone took 426 ms at 50k rows. Writing the two fields out
  explicitly cut the data task from 686 ms to 213 ms (50k) and from 148 ms to 54 ms (10k).
- In the naive 50k scenario, two of three runs were still blocked when the scroll step started and
  timed out. Its scroll figures come from the one run that got that far.

`Rows on screen after load` includes waiting for the first paint before fetching the data (see
below). That trade-off costs a little time-to-data on a fast connection and saves more than a second
of LCP on a slow one.

## Lighthouse (lab, mobile profile)

Lighthouse 12.6 via `@lhci/cli`, default mobile settings (simulated slow 4G, 4x CPU slowdown),
3 runs per page, production build served statically. Representative (median) run:

| Page         |  LCP  |  FCP  | TBT   | CLS | Performance | Accessibility | Script (transferred) |
| ------------ | :---: | :---: | ----- | :-: | :---------: | :-----------: | -------------------: |
| `/`          | 2.2 s | 1.7 s | 12 ms |  0  |    0.98     |       1       |               168 kB |
| `/watchlist` | 2.0 s | 1.6 s | 3 ms  |  0  |    0.99     |       1       |               161 kB |

Total blocking time was about 100 ms on both pages before the snapshot decoding fix described above.
The script figure is what the static server sent (gzip). Firebase Hosting serves Brotli, which is
about 13% smaller.

### How LCP got from 4.3 s to 2.2 s

The first Lighthouse run of the screener gave an LCP of **4.3 s**. The LCP element was the page heading,
with 90% of the time spent as "render delay": the heading could only render at the end of a chain
of requests.

1. **Request chain: `main.js` → translations JSON → lazy route chunk.** The heading needs the
   English translations (fetched over HTTP after the app started) and the screener route (a lazy chunk).
   The default language is now bundled, other languages are still fetched when chosen, and the landing
   route is part of the initial bundle. Every first visit requested both anyway. **4.3 s → 3.8 s**,
   at the cost of a larger initial bundle (budget below).
2. **The data snapshot competed with the first paint.** The 290 kB snapshot request started during
   bootstrap, and on a slow connection it shared bandwidth with what paints the page. Starting it
   after the first render was not enough: Chrome can run frame callbacks before it presents the
   first frame. The fetch now waits for the browser's `first-contentful-paint` entry, with a 300 ms
   fallback. Skeletons hold the layout meanwhile, so CLS stays at 0. **3.8 s → 2.2 s.**
3. **The watchlist waited for market data even when empty.** Its LCP element is the empty-state text,
   which only rendered after the snapshot arrived (3.5 s). An empty watchlist needs no market data,
   so it now renders as soon as the watchlist has loaded. **3.5 s → 2.0 s.**

## JavaScript budget

The Angular build fails above **600 kB** raw initial JavaScript, with a warning at **560 kB**. The
current initial bundle is **524 kB raw, 155 kB gzip, 134 kB Brotli**.

Why that number:

- **It follows from LCP, not the other way round.** On the Lighthouse mobile profile the screener's LCP is
  2.2 s with this bundle. Simulated slow 4G is about 1.6 Mbps, so every extra 10 kB (Brotli) costs
  roughly 50 ms of download, plus parse and compile time at 4x CPU. The warning at 560 kB (about
  +9 kB Brotli) leaves room for normal growth. The 600 kB error (about +20 kB Brotli) is the point
  where LCP would approach the 2.5 s target.
- **What's in it is deliberate.** Angular, the router, the CDK virtual scroller, @ngx-translate, the
  English translations and the screener route, which every visitor needs. Not in it: the detail
  drawer and chart (`@defer`, prefetched on idle), the watchlist route, the watchlist notifications,
  Spanish, the query worker and the data.
- Lighthouse CI also checks the script transferred per page (≤ 180 kB), which includes the lazy chunks
  and the worker a page loads.

## Commands

```sh
npx nx build screener
npm run perf:measure     # before/after table above (about 5 minutes); prints JSON
npm run lighthouse       # Lighthouse CI with the assertions in lighthouserc.json
```

- `tools/perf/measure.mjs` serves `dist/` and drives Chromium with Playwright. It reads long tasks
  and Event Timing entries from `PerformanceObserver`, and measures frame intervals with
  `requestAnimationFrame` while scrolling with the mouse wheel. Locale is pinned to `en-US` and
  service workers are blocked, so every run is a cold load.
- Try the scenarios by hand: `?naive=1`, `?rows=50000`, or both, on a production build
  (`npx nx run screener:serve-static`).
