import type { ColumnFormat } from '../market/columns';
import type { Currency } from '../market/instrument';

/**
 * Locale-aware formatting built on `Intl`. Formatter instances are expensive to create and are
 * called for every visible cell, so they are cached per locale and options.
 */
export interface Formatters {
  readonly locale: string;
  price(value: number, currency: Currency): string;
  /** `2.5` → `2.5%` (value is already in percent). */
  percent(value: number): string;
  /** Like `percent`, with an explicit sign: `+2.5%`, `−1.2%`. */
  signedPercent(value: number): string;
  /** `1250000` → `1.3M` / `1,3 M`. */
  compact(value: number): string;
  /** Compact USD amount: `$1.3B` / `1,3 mil M US$`. */
  compactUsd(value: number): string;
  ratio(value: number | null): string;
  integer(value: number): string;
  /** ISO `YYYY-MM-DD` → localised medium date, interpreted in UTC. */
  date(isoDate: string): string;
  /** Formats a cell according to the column registry's format. */
  cell(format: ColumnFormat, value: unknown, currency: Currency): string;
}

/** Shown for missing values (e.g. no P/E ratio). */
export const MISSING_VALUE = '—';

const CURRENCY_DECIMALS: Readonly<Record<Currency, number>> = {
  USD: 2,
  GBP: 2,
  EUR: 2,
  JPY: 0,
};

const cache = new Map<string, Formatters>();

export function getFormatters(locale: string): Formatters {
  let formatters = cache.get(locale);
  if (!formatters) {
    formatters = createFormatters(locale);
    cache.set(locale, formatters);
  }
  return formatters;
}

function createFormatters(locale: string): Formatters {
  const numberFormats = new Map<string, Intl.NumberFormat>();
  const number = (options: Intl.NumberFormatOptions): Intl.NumberFormat => {
    const key = JSON.stringify(options);
    let format = numberFormats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, options);
      numberFormats.set(key, format);
    }
    return format;
  };
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
  const finite = (value: number, fn: (v: number) => string): string =>
    Number.isFinite(value) ? fn(value) : MISSING_VALUE;

  const formatters: Formatters = {
    locale,
    price: (value, currency) =>
      finite(value, (v) =>
        number({
          style: 'currency',
          currency,
          minimumFractionDigits: CURRENCY_DECIMALS[currency],
          maximumFractionDigits: CURRENCY_DECIMALS[currency],
        }).format(v),
      ),
    percent: (value) =>
      finite(value, (v) =>
        number({
          style: 'percent',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(v / 100),
      ),
    signedPercent: (value) =>
      finite(value, (v) =>
        number({
          style: 'percent',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          signDisplay: 'exceptZero',
        }).format(v / 100),
      ),
    compact: (value) =>
      finite(value, (v) =>
        number({ notation: 'compact', maximumFractionDigits: 1 }).format(v),
      ),
    compactUsd: (value) =>
      finite(value, (v) =>
        number({
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(v),
      ),
    ratio: (value) =>
      value === null
        ? MISSING_VALUE
        : finite(value, (v) =>
            number({
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(v),
          ),
    integer: (value) =>
      finite(value, (v) => number({ maximumFractionDigits: 0 }).format(v)),
    date: (isoDate) => {
      const date = new Date(`${isoDate}T00:00:00Z`);
      return Number.isNaN(date.getTime())
        ? MISSING_VALUE
        : dateFormat.format(date);
    },
    cell: (format, value, currency) => {
      if (value === null || value === undefined) {
        return MISSING_VALUE;
      }
      if (format === 'text') {
        return String(value);
      }
      if (typeof value !== 'number') {
        return MISSING_VALUE;
      }
      switch (format) {
        case 'price':
          return formatters.price(value, currency);
        case 'percent':
          return formatters.percent(value);
        case 'signedPercent':
          return formatters.signedPercent(value);
        case 'compact':
          return formatters.compact(value);
        case 'compactUsd':
          return formatters.compactUsd(value);
        case 'ratio':
          return formatters.ratio(value);
      }
    },
  };
  return formatters;
}
