import { createRandom, type Random } from '../random/prng';
import {
  EXCHANGE_INFO,
  type Exchange,
  type Instrument,
  instrumentId,
  SECTORS,
  type Sector,
} from './instrument';

/**
 * Deterministic generator for a realistic-looking instrument universe. The same seed and count
 * always produce the same rows, which keeps the bundled snapshot reproducible and lets the
 * 50k-row stress mode be generated on the client instead of downloaded.
 */

/** Rough share of listings per exchange. */
const EXCHANGE_WEIGHTS: readonly [Exchange, number][] = [
  ['NASDAQ', 0.3],
  ['NYSE', 0.25],
  ['LSE', 0.12],
  ['XETRA', 0.09],
  ['EURONEXT', 0.09],
  ['BME', 0.05],
  ['TSE', 0.1],
];

/** Approximate local currency per USD, used to convert USD market caps into prices. */
const FX_PER_USD = { USD: 1, GBP: 0.78, EUR: 0.92, JPY: 148 } as const;

const ETF_SHARE = 0.15;

const SYLLABLES = [
  'ac',
  'al',
  'an',
  'ar',
  'av',
  'bel',
  'bri',
  'cal',
  'cor',
  'cy',
  'da',
  'del',
  'en',
  'ex',
  'fi',
  'gen',
  'hal',
  'in',
  'io',
  'kar',
  'lu',
  'lex',
  'ma',
  'mer',
  'nor',
  'nov',
  'or',
  'pax',
  'per',
  'qu',
  'ra',
  'ri',
  'sol',
  'syn',
  'ta',
  'ter',
  'tri',
  'ul',
  'ver',
  'vi',
  'xa',
  'zen',
] as const;

const COMPANY_SUFFIX: Readonly<Record<Exchange, readonly string[]>> = {
  NYSE: ['Inc.', 'Corp.', 'Holdings', 'Group', 'Co.'],
  NASDAQ: ['Inc.', 'Technologies', 'Systems', 'Labs', 'Holdings'],
  LSE: ['plc', 'Group plc', 'Holdings plc'],
  XETRA: ['AG', 'SE', 'Gruppe AG'],
  EURONEXT: ['SA', 'NV', 'Groupe SA'],
  BME: ['SA', 'Grupo SA', 'Corporación SA'],
  TSE: ['KK', 'Holdings KK', 'Corporation'],
};

const SECTOR_WORDS: Readonly<Record<Sector, readonly string[]>> = {
  Communication: ['Media', 'Telecom', 'Networks'],
  ConsumerDiscretionary: ['Retail', 'Motors', 'Brands'],
  ConsumerStaples: ['Foods', 'Beverages', 'Household'],
  Energy: ['Energy', 'Petroleum', 'Resources'],
  Financials: ['Bank', 'Capital', 'Insurance'],
  HealthCare: ['Health', 'Pharma', 'Bio'],
  Industrials: ['Industries', 'Aerospace', 'Logistics'],
  Materials: ['Materials', 'Chemicals', 'Mining'],
  RealEstate: ['Properties', 'Realty', 'REIT'],
  Technology: ['Software', 'Semiconductors', 'Digital'],
  Utilities: ['Power', 'Utilities', 'Water'],
};

const ETF_ISSUERS = [
  'Vantix',
  'iCore',
  'Solaris',
  'Northgate',
  'Meridian',
] as const;
const ETF_REGIONS = [
  'World',
  'US',
  'Europe',
  'Japan',
  'Emerging',
  'Global',
] as const;

export function generateInstruments(seed: number, count: number): Instrument[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count must be a non-negative integer, got ${count}`);
  }
  const random = createRandom(seed);
  const usedIds = new Set<string>();
  const rows: Instrument[] = [];

  while (rows.length < count) {
    const exchange = pickWeighted(random, EXCHANGE_WEIGHTS);
    const symbol = makeSymbol(random, exchange);
    const id = instrumentId(exchange, symbol);
    if (usedIds.has(id)) {
      continue;
    }
    usedIds.add(id);
    rows.push(makeInstrument(random, id, symbol, exchange));
  }
  return rows;
}

function makeInstrument(
  random: Random,
  id: string,
  symbol: string,
  exchange: Exchange,
): Instrument {
  const { country, currency } = EXCHANGE_INFO[exchange];
  const isEtf = random.chance(ETF_SHARE);
  const sector = random.pick(SECTORS);

  // Log-normal market cap: median around $2B, long tail up to a few trillion.
  const marketCapUsd = clamp(
    Math.exp(random.normal(Math.log(2e9), 1.6)),
    3e7,
    3.5e12,
  );
  const fx = FX_PER_USD[currency];
  const decimals = currency === 'JPY' ? 0 : 2;
  const price = round(
    clamp(Math.exp(random.normal(Math.log(45), 1.1)), 0.5, 4000) *
      (currency === 'JPY' ? fx / 10 : 1),
    decimals,
  );

  const changePct = round(clamp(random.normal(0.05, 2.1), -25, 25), 2);
  const shares = marketCapUsd / (price / fx);
  const volume = Math.round(
    shares * clamp(Math.exp(random.normal(Math.log(0.004), 0.8)), 0.0002, 0.08),
  );

  const beta = round(
    clamp(random.normal(isEtf ? 0.95 : 1.05, isEtf ? 0.2 : 0.4), 0.2, 2.6),
    2,
  );
  const spread = clamp(
    0.15 + Math.abs(random.normal(0, 0.18)) * beta,
    0.05,
    1.5,
  );
  const high52w = round(price * (1 + random.float(0, spread)), decimals);
  const low52w = round(price / (1 + random.float(0, spread)), decimals);

  const peRatio =
    isEtf || random.chance(0.14)
      ? null
      : round(clamp(Math.exp(random.normal(Math.log(18), 0.5)), 3, 150), 1);
  const dividendYield = random.chance(isEtf ? 0.4 : 0.35)
    ? 0
    : round(clamp(Math.exp(random.normal(Math.log(2), 0.6)), 0.1, 12), 2);

  return {
    id,
    symbol,
    name: isEtf
      ? makeEtfName(random, sector)
      : makeCompanyName(random, exchange, sector),
    type: isEtf ? 'etf' : 'equity',
    exchange,
    country,
    currency,
    sector,
    price,
    changePct,
    volume,
    marketCapUsd: Math.round(marketCapUsd),
    peRatio,
    dividendYield,
    beta,
    high52w: Math.max(high52w, price),
    low52w: Math.min(low52w, price),
  };
}

function makeSymbol(random: Random, exchange: Exchange): string {
  if (exchange === 'TSE') {
    // Tokyo listings use four-digit codes.
    return String(random.int(1300, 9999));
  }
  const length = exchange === 'NASDAQ' ? random.int(3, 5) : random.int(2, 4);
  let symbol = '';
  for (let i = 0; i < length; i++) {
    symbol += String.fromCharCode(65 + random.int(0, 25));
  }
  return symbol;
}

function makeCompanyName(
  random: Random,
  exchange: Exchange,
  sector: Sector,
): string {
  const syllables = random.int(2, 3);
  let stem = '';
  for (let i = 0; i < syllables; i++) {
    stem += random.pick(SYLLABLES);
  }
  const base = stem.charAt(0).toUpperCase() + stem.slice(1);
  const word = random.chance(0.6)
    ? ` ${random.pick(SECTOR_WORDS[sector])}`
    : '';
  return `${base}${word} ${random.pick(COMPANY_SUFFIX[exchange])}`;
}

function makeEtfName(random: Random, sector: Sector): string {
  const theme = random.chance(0.5)
    ? random.pick(SECTOR_WORDS[sector])
    : 'Equity';
  return `${random.pick(ETF_ISSUERS)} ${random.pick(ETF_REGIONS)} ${theme} ETF`;
}

function pickWeighted<T>(random: Random, weighted: readonly [T, number][]): T {
  const total = weighted.reduce((sum, [, w]) => sum + w, 0);
  let roll = random.float(0, total);
  for (const [item, weight] of weighted) {
    roll -= weight;
    if (roll < 0) {
      return item;
    }
  }
  return (weighted[weighted.length - 1] as [T, number])[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
