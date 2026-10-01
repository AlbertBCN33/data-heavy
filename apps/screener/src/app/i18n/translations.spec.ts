import { readWorkspaceJson } from '@data-heavy/ui/testing';
import { LANGUAGES } from '@data-heavy/util';

type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else {
      for (const [k, v] of flatten(value, path)) {
        entries.set(k, v);
      }
    }
  }
  return entries;
}

const params = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const load = (code: string) =>
  flatten(
    readWorkspaceJson<Tree>(`apps/screener/src/assets/i18n/${code}.json`),
  );

/**
 * Keeps the translation files in step: a key or interpolation parameter missing in one language
 * would otherwise only show up as a raw key in production.
 */
describe('translation files', () => {
  const [base, ...others] = LANGUAGES.map((l) => ({
    code: l.code,
    keys: load(l.code),
  }));

  it('exist for every supported language', () => {
    expect(base?.keys.size).toBeGreaterThan(100);
    expect(others).toHaveLength(LANGUAGES.length - 1);
  });

  for (const other of others) {
    it(`${other.code} has exactly the same keys as ${base?.code}`, () => {
      expect([...other.keys.keys()].sort()).toEqual(
        [...(base?.keys.keys() ?? [])].sort(),
      );
    });

    it(`${other.code} uses the same interpolation parameters as ${base?.code}`, () => {
      for (const [key, text] of base?.keys ?? []) {
        expect({ key, params: params(other.keys.get(key) ?? '') }).toEqual({
          key,
          params: params(text),
        });
      }
    });

    it(`${other.code} has no empty translations`, () => {
      expect([...other.keys].filter(([, text]) => text.trim() === '')).toEqual(
        [],
      );
    });
  }
});
