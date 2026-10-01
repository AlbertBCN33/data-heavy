# market-data-tool

Generates the market data snapshot the app loads at runtime (`/data/market-snapshot.json`).

```sh
npx tsx --tsconfig tools/market-data/tsconfig.json tools/market-data/generate.ts [--seed 42] [--count 10000] [--as-of 2026-09-30] [--out <file>]
```

- Output is deterministic for a given seed, count and as-of date. The generation logic lives in
  `@data-heavy/util` (`generateInstruments`, `encodeSnapshot`) and is unit-tested there.
- The file is not committed. `nx run screener:market-data` writes it to
  `apps/screener/public/data/`, and `build` and `serve` depend on that target, so Nx regenerates
  it only when the generator or its inputs change.
- Format: columnar JSON with dictionary-encoded enums. See `libs/screener/util/src/lib/market/snapshot.ts`.
