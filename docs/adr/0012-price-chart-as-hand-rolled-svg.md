# 0012. Price chart as a small hand-rolled SVG

- Status: Accepted
- Date: 2026-10-01

## Context

The detail drawer shows one line chart: daily closes for one instrument over 1, 3, 6 or 12
months (at most 252 points), with a hover read-out. It must meet WCAG 2.2 AA, follow the app's
light/dark tokens, and stay out of the initial bundle.

Options measured on 2026-10-01:

| Option                         | Size (min + gzip)                                                | Notes                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Hand-rolled SVG**            | Whole drawer + chart chunk: **4.8 kB**                           | ~390 lines including template, styles and geometry. Themeable with CSS variables, crisp at any zoom, no dependency |
| uPlot 1.6.32                   | 21.6 kB (+0.7 kB CSS)                                            | Very fast canvas charts for thousands of points. Last release March 2025. Canvas needs its own text alternative    |
| Chart.js 4.5.1 / ECharts 6.1.0 | 69.1 kB / 361.3 kB (full builds; tree-shaken builds are smaller) | Feature-rich. Far more than one line chart needs                                                                   |

A chart library pays off with many chart types, large series, zooming or panning. None of those
apply here: 252 points render trivially as one SVG path.

## Decision

Draw the chart with SVG (`feature-detail/src/lib/chart`):

- **Geometry is a pure function** (`buildChart`, `nearestIndex`): scales points into a fixed
  viewBox, unit-tested without a DOM. The SVG stretches to its container
  (`preserveAspectRatio="none"`, `vector-effect: non-scaling-stroke` keeps the line 2 px).
  Labels are HTML, so text never distorts.
- **Accessibility.** The SVG is decorative (`aria-hidden`). A `figcaption` gives a one-sentence
  summary (direction, change, start/end, high/low), and a toggle reveals the full series as a
  `<table>` with a caption and row headers. The hover crosshair is a mouse enhancement only; the
  same values are in the table.
- **Colour.** The line uses the contrast-checked gain/loss text tokens (≥ 4.5:1 in both themes),
  and the direction is also stated in words.
- **No layout shift.** The plot has a fixed height, matched by the loading skeleton.
- **Loading.** The drawer (with the chart) is `@defer`red until something is selected and
  prefetched on idle. Price history is a `resource()` keyed by instrument and range, so
  superseded requests are aborted.

Data consistency, found while reviewing the drawer: the generator used to invent the 52-week
high/low independently of the price history, so the drawer showed a 52-week range that
contradicted its own one-year chart. The 52-week range is now derived from the same deterministic
series (`generateCloses`), and the series' last step reflects the day's change. An e2e test checks
that the stats and the chart agree.

## Consequences

- No chart dependency to update or audit, and the drawer chunk stays under 5 kB.
- Adding chart types (candles, volume bars, comparisons) would mean writing them ourselves. At
  that point a library such as uPlot becomes the better trade, and the component's inputs
  (points, currency, locale) would not change.
- Generating the snapshot now computes a one-year series per instrument (185 ms for 10k rows at
  build time).
