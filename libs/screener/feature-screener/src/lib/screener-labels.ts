import type { ColumnKey, EnumColumnKey } from '@data-heavy/util';

/** Visible column names. English for now; replaced by translations in the i18n milestone. */
export const COLUMN_LABELS: Readonly<Record<ColumnKey, string>> = {
  symbol: 'Symbol',
  name: 'Name',
  type: 'Type',
  exchange: 'Exchange',
  sector: 'Sector',
  country: 'Country',
  price: 'Price',
  changePct: 'Change',
  volume: 'Volume',
  marketCapUsd: 'Market cap',
  peRatio: 'P/E',
  dividendYield: 'Div. yield',
  beta: 'Beta',
  high52w: '52w high',
  low52w: '52w low',
};

const TYPE_LABELS: Readonly<Record<string, string>> = {
  equity: 'Equity',
  etf: 'ETF',
};

const SECTOR_LABELS: Readonly<Record<string, string>> = {
  Communication: 'Communication',
  ConsumerDiscretionary: 'Consumer discretionary',
  ConsumerStaples: 'Consumer staples',
  Energy: 'Energy',
  Financials: 'Financials',
  HealthCare: 'Health care',
  Industrials: 'Industrials',
  Materials: 'Materials',
  RealEstate: 'Real estate',
  Technology: 'Technology',
  Utilities: 'Utilities',
};

const regionNames = new Map<string, Intl.DisplayNames>();

/** Display label for an enum value. Countries use `Intl.DisplayNames`, so they are localised. */
export function optionLabel(
  key: EnumColumnKey,
  value: string,
  locale: string,
): string {
  switch (key) {
    case 'type':
      return TYPE_LABELS[value] ?? value;
    case 'sector':
      return SECTOR_LABELS[value] ?? value;
    case 'country': {
      let names = regionNames.get(locale);
      if (!names) {
        names = new Intl.DisplayNames([locale], { type: 'region' });
        regionNames.set(locale, names);
      }
      return names.of(value) ?? value;
    }
    case 'exchange':
      return value;
  }
}
