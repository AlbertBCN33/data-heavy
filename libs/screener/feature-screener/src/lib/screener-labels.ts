import type { ColumnKey, EnumColumnKey } from '@data-heavy/util';

/** Translation key of a column's visible name (`columns.marketCapUsd`). */
export function columnLabelKey(key: ColumnKey): string {
  return `columns.${key}`;
}

/** Looks up a translation by key; components pass `TranslateService.instant`. */
export type Translate = (key: string) => string;

const regionNames = new Map<string, Intl.DisplayNames>();

/**
 * Display label for an enum value: translated for types and sectors, `Intl.DisplayNames` for
 * countries (already localised), and as-is for exchange codes.
 */
export function optionLabel(
  key: EnumColumnKey,
  value: string,
  locale: string,
  translate: Translate,
): string {
  switch (key) {
    case 'type':
      return translate(`types.${value}`);
    case 'sector':
      return translate(`sectors.${value}`);
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
