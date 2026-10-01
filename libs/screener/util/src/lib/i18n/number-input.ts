/**
 * Locale-aware conversion between numbers and what users type in number filters. The URL always
 * stores canonical numbers (`2.5`); inputs show and accept the user's convention (`2,5` in
 * Spanish), plus `k`/`M`/`B`/`T` suffixes.
 */

interface Separators {
  readonly group: string;
  readonly decimal: string;
}

const separatorCache = new Map<string, Separators>();

function separators(locale: string): Separators {
  let result = separatorCache.get(locale);
  if (!result) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    result = {
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    };
    separatorCache.set(locale, result);
  }
  return result;
}

/** A number as the user would type it: no grouping, locale decimal separator. */
export function formatNumberInput(
  value: number | undefined,
  locale: string,
): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '';
  }
  const { decimal } = separators(locale);
  return String(value).replace('.', decimal);
}

/**
 * Converts typed text to the canonical form the URL codec understands (`1.234,5` → `1234.5` in
 * Spanish; `2,5B` → `2.5B`). Returns the text unchanged when it is empty. Grouping separators are
 * dropped; the locale decimal separator becomes a dot.
 */
export function normalizeNumberInput(value: string, locale: string): string {
  const trimmed = value.trim().replace(/\s/g, '');
  if (trimmed === '') {
    return '';
  }
  const { group, decimal } = separators(locale);
  let result = trimmed;
  if (decimal === ',') {
    // A dot groups thousands here ("1.000" is one thousand), but people also type "2.5" meaning
    // two and a half. Without a comma, dots only count as grouping when every group after the
    // first has exactly three digits.
    const groupedThousands = /^-?\d{1,3}(\.\d{3})+([kmbt])?$/i.test(result);
    if (result.includes(',') || groupedThousands) {
      result = result
        .split(group)
        .join('')
        .split('.')
        .join('')
        .replace(',', '.');
    }
  } else {
    result = result.split(group).join('');
  }
  return result;
}
