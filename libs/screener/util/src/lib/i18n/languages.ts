/** Languages the UI is translated into. */
export const LANGUAGES = [
  { code: 'en', locale: 'en-US', nativeName: 'English' },
  { code: 'es', locale: 'es-ES', nativeName: 'Español' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

/** BCP 47 locale used for number, currency and date formatting. */
export function localeFor(code: LanguageCode): string {
  return (LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]).locale;
}

export interface LanguageSources {
  /** `?lang=` from the URL, e.g. a shared link. */
  readonly urlParam?: string | null;
  /** The user's previous choice. */
  readonly stored?: string | null;
  /** `navigator.languages`, most preferred first. */
  readonly browser?: readonly string[];
}

/**
 * Picks the initial language: an explicit URL parameter wins, then the user's saved choice, then
 * the first supported browser language (`es-MX` → `es`), then English.
 */
export function resolveLanguage({
  urlParam,
  stored,
  browser = [],
}: LanguageSources): LanguageCode {
  if (isLanguageCode(urlParam)) {
    return urlParam;
  }
  if (isLanguageCode(stored)) {
    return stored;
  }
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguageCode(base)) {
      return base;
    }
  }
  return DEFAULT_LANGUAGE;
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** CLDR plural category (`one`, `other`, …) for a count, to pick a translation key. */
export function pluralCategory(
  count: number,
  locale: string,
): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(count);
}
