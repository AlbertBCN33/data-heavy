# 0014. Runtime i18n with @ngx-translate

- Status: Accepted
- Date: 2026-10-01

## Context

The UI must be available in English and Spanish, switchable at runtime without a reload, with
locale-aware numbers, currencies and dates. Angular's built-in i18n (`@angular/localize`)
compiles one bundle per locale and cannot switch at runtime without a reload into another build.

## Decision

**Translations:** `@ngx-translate/core` 18 with its HTTP loader. Files live in
`apps/screener/src/assets/i18n/{en,es}.json`, with keys namespaced by feature (`screener.*`,
`detail.*`, `watchlist.*`, …).

- The active language is loaded in an app initializer before the first render, so raw keys never
  flash. Both files are prefetched by the service worker, so switching works offline.
- Whole sentences with named parameters (`{{symbol}}`) rather than concatenated fragments, so
  translators control word order.
- Plurals use CLDR categories via `Intl.PluralRules` (`.one` / `.other` keys).
- Route titles are translation keys, applied by a custom `TitleStrategy` that also reacts to
  language changes.

**Language state:** `LocaleState` in `data-access` is the source of truth. It is framework-only
signal state, independent of the translation library. Initial language comes from `?lang=` (shareable
links), then the saved choice, then the browser languages, then English. Switching updates
`<html lang>` (correct screen reader pronunciation), persists the choice, and the app reacts by
loading the translations.

**Formatting:** every number, currency, percentage and date goes through the cached `Intl`
formatters in `util`, with the locale from `LocaleState`. Country names use
`Intl.DisplayNames`, so they need no translation table. Number inputs accept the user's
convention (`2,5`, `1.000` in Spanish) and the URL keeps canonical numbers (`2.5..1000`), so links
work across languages.

**Layering:**

- `util` stays pure: language resolution, plural categories, number input conversion.
- `ui` has no i18n dependency. Components take translated strings as inputs, and toast labels come
  from a `TOAST_LABELS` signal the app fills from the translations.
- Pure functions that used to return English (the chart summary) now return structured, formatted
  values, and the component builds the translated sentence.

**Testing:**

- Unit tests run with the real English file, read from disk by each library's test setup, so a key
  missing from `en.json` fails visibly.
- A parity test checks that every language has the same keys and the same interpolation parameters.
- e2e covers the runtime switch, persistence, `?lang=` links, Spanish number input, the drawer and
  axe in Spanish.

## Consequences

- One build serves every language. The cost is 5.5 kB on the initial bundle (98.5 kB transferred)
  and one small JSON request before first render (cached by the service worker afterwards).
  _Update ([ADR 0015](0015-performance-budgets-and-quality-gates.md)): that request sat on the LCP
  critical path, so English is now bundled and only other languages are fetched._
- Translations are not type-checked at compile time. The parity test and the "real English in unit
  tests" setup catch missing keys before production.
- Adding a language is a JSON file plus an entry in `LANGUAGES`. The parity test then enforces
  completeness.
