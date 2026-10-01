# 0006. Market data: generated snapshot behind a port

- Status: Accepted
- Date: 2026-10-01

## Context

The app needs 10k+ realistic instruments, price histories and a per-user watchlist. There is no
backend, the demo must work without API keys, and real market data feeds are licensed. The UI
still has to deal with latency, failures and invalid data, as it would against a real API.

## Decision

**Data source: a generated, deterministic snapshot.**

- `generateInstruments(seed, count)` in `@data-heavy/util` produces a plausible universe: seven
  exchanges, 15% ETFs, log-normal market caps and prices, and consistent 52-week ranges. The same
  seed always gives the same rows.
- `tools/market-data` writes it as JSON. The file is **not committed**: the
  `screener:market-data` Nx target regenerates it (cached) before `build` and `serve`.
- Price histories are not shipped. `generatePriceHistory` derives them on demand from the
  instrument id, as a random walk that ends at the current price.
- The 50k-row stress mode can generate rows on the client from the same function instead of
  downloading a 1.5 MB file.

**Wire format: columnar JSON with dictionary-encoded enums**, validated on decode.

| 10k rows                                                                                              | Raw    | gzip   |
| ----------------------------------------------------------------------------------------------------- | ------ | ------ |
| First version                                                                                         | 910 kB | 315 kB |
| Market cap and volume rounded to 3 significant digits, country and currency derived from the exchange | 871 kB | 269 kB |

The UI only shows market cap and volume in compact form (`$8.8B`), so the rounding is invisible. Deriving
country and currency also makes an inconsistent row impossible. Row-oriented JSON would repeat 16 property names per row.
Binary formats (Arrow, MessagePack) would be smaller but add a decoder to the bundle and make the
data harder to inspect. Not worth it at this size.

**Access: a `MarketDataPort` with interchangeable adapters** (ports and adapters).

- `MarketDataPort` (abstract class used as the DI token) is the only thing features depend on.
  Methods return promises (for Angular's `resource()`), accept an `AbortSignal`, and reject with a
  typed `MarketDataError` (`network` (retryable), `invalid-data`, `not-found`, `aborted`).
- `StaticJsonAdapter` (default) fetches the snapshot once, validates it, shares concurrent requests,
  does not cache failures, and keeps the watchlist in browser storage behind a `KeyValueStorage`
  abstraction that falls back to memory when storage is unavailable.
- `SimulatedLatencyAdapter` decorates any port with seeded latency and failures, so loading
  skeletons, retries, error states and optimistic rollback can be demonstrated and tested. Failures
  are decided before the wrapped call, so a failed mutation never takes effect.

## Consequences

- No API keys, rate limits or licensing. The live demo always works.
- Swapping in a real API is one new adapter. Features and tests stay untouched.
- The data is synthetic. The README says so, and names do not imitate real companies.
- Fresh clones need one generation step. `build` and `serve` depend on it, so it runs automatically.
