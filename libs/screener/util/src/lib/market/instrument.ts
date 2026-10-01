/**
 * Domain model for a listed instrument. Prices are in the instrument's own currency;
 * market capitalisation is normalised to USD so it can be compared across exchanges.
 */

export const ASSET_TYPES = ['equity', 'etf'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const EXCHANGES = [
  'NYSE',
  'NASDAQ',
  'LSE',
  'XETRA',
  'EURONEXT',
  'BME',
  'TSE',
] as const;
export type Exchange = (typeof EXCHANGES)[number];

export const SECTORS = [
  'Communication',
  'ConsumerDiscretionary',
  'ConsumerStaples',
  'Energy',
  'Financials',
  'HealthCare',
  'Industrials',
  'Materials',
  'RealEstate',
  'Technology',
  'Utilities',
] as const;
export type Sector = (typeof SECTORS)[number];

export const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'ES', 'JP'] as const;
export type Country = (typeof COUNTRIES)[number];

export const CURRENCIES = ['USD', 'GBP', 'EUR', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Where each exchange is and what it trades in. */
export const EXCHANGE_INFO: Readonly<
  Record<Exchange, { country: Country; currency: Currency }>
> = {
  NYSE: { country: 'US', currency: 'USD' },
  NASDAQ: { country: 'US', currency: 'USD' },
  LSE: { country: 'GB', currency: 'GBP' },
  XETRA: { country: 'DE', currency: 'EUR' },
  EURONEXT: { country: 'FR', currency: 'EUR' },
  BME: { country: 'ES', currency: 'EUR' },
  TSE: { country: 'JP', currency: 'JPY' },
};

export interface Instrument {
  /** Stable identifier, `EXCHANGE:SYMBOL`. */
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly type: AssetType;
  readonly exchange: Exchange;
  readonly country: Country;
  readonly currency: Currency;
  readonly sector: Sector;
  /** Last price in `currency`. */
  readonly price: number;
  /** One-day change in percent (e.g. `-1.25` means −1.25 %). */
  readonly changePct: number;
  /** Shares traded in the last session. */
  readonly volume: number;
  /** Market capitalisation (assets under management for ETFs) in USD. */
  readonly marketCapUsd: number;
  /** Price/earnings ratio; `null` for ETFs and loss-making companies. */
  readonly peRatio: number | null;
  /** Trailing dividend yield in percent. */
  readonly dividendYield: number;
  readonly beta: number;
  /** 52-week high and low in `currency`. */
  readonly high52w: number;
  readonly low52w: number;
}

export interface PricePoint {
  /** ISO date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly close: number;
}

export const INSTRUMENT_ID_PATTERN = /^[A-Z]+:[A-Z0-9.]{1,10}$/;

export function instrumentId(exchange: Exchange, symbol: string): string {
  return `${exchange}:${symbol}`;
}
