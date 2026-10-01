import {
  isLanguageCode,
  LANGUAGES,
  localeFor,
  pluralCategory,
  resolveLanguage,
} from './languages';

describe('languages', () => {
  it('lists English and Spanish with their locales', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'es']);
    expect(localeFor('en')).toBe('en-US');
    expect(localeFor('es')).toBe('es-ES');
    expect(isLanguageCode('es')).toBe(true);
    expect(isLanguageCode('fr')).toBe(false);
  });

  describe('resolveLanguage', () => {
    it('prefers the URL parameter, then the saved choice, then the browser', () => {
      expect(
        resolveLanguage({ urlParam: 'es', stored: 'en', browser: ['en-US'] }),
      ).toBe('es');
      expect(
        resolveLanguage({ urlParam: null, stored: 'es', browser: ['en-US'] }),
      ).toBe('es');
      expect(resolveLanguage({ browser: ['fr-FR', 'es-MX', 'en'] })).toBe('es');
    });

    it('ignores unsupported values and falls back to English', () => {
      expect(
        resolveLanguage({ urlParam: 'fr', stored: 'xx', browser: ['de-DE'] }),
      ).toBe('en');
      expect(resolveLanguage({})).toBe('en');
    });
  });

  it('selects CLDR plural categories per locale', () => {
    expect(pluralCategory(1, 'en-US')).toBe('one');
    expect(pluralCategory(2, 'en-US')).toBe('other');
    expect(pluralCategory(0, 'es-ES')).toBe('other');
    expect(pluralCategory(1, 'es-ES')).toBe('one');
    expect(pluralCategory(1, 'en-US')).toBe(pluralCategory(1, 'en-US')); // cached
  });
});
