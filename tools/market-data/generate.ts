/**
 * Generates the bundled market data snapshot.
 *
 *   npx tsx --tsconfig tools/market-data/tsconfig.json tools/market-data/generate.ts [--seed 42] [--count 10000] [--as-of 2026-09-30] [--out <file>]
 *
 * Output is deterministic for a given seed, count and as-of date, so the file is not committed:
 * the `screener:market-data` Nx target regenerates (and caches) it before build and serve.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

import { encodeSnapshot, generateInstruments } from '@data-heavy/util';

export const DEFAULTS = {
  seed: 42,
  count: 10_000,
  asOf: '2026-09-30',
  out: 'apps/screener/public/data/market-snapshot.json',
} as const;

function main(): void {
  const { values } = parseArgs({
    options: {
      seed: { type: 'string', default: String(DEFAULTS.seed) },
      count: { type: 'string', default: String(DEFAULTS.count) },
      'as-of': { type: 'string', default: DEFAULTS.asOf },
      out: { type: 'string', default: DEFAULTS.out },
    },
  });

  const seed = toInteger(values.seed, 'seed');
  const count = toInteger(values.count, 'count');
  const asOf = values['as-of'];
  const out = resolve(values.out);

  const started = performance.now();
  const rows = generateInstruments(seed, count);
  const json = JSON.stringify(encodeSnapshot(rows, { asOf, seed }));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);

  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} kB`;
  const ms = (performance.now() - started).toFixed(0);
  console.log(
    `Wrote ${count} instruments (seed ${seed}, as of ${asOf}) to ${values.out}: ` +
      `${kb(Buffer.byteLength(json))} raw, ${kb(gzipSync(json).byteLength)} gzip, ${ms} ms`,
  );
}

function toInteger(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer, got "${value}"`);
  }
  return n;
}

main();
