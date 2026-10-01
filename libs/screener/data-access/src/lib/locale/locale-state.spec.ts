import { TestBed } from '@angular/core/testing';

import {
  KEY_VALUE_STORAGE,
  type KeyValueStorage,
  memoryStorage,
} from '../key-value-storage';
import { LANGUAGE_STORAGE_KEY, LocaleState } from './locale-state';

function setup(
  storage: KeyValueStorage = memoryStorage(),
  browser = ['en-US'],
) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(browser);
  TestBed.configureTestingModule({
    providers: [{ provide: KEY_VALUE_STORAGE, useValue: storage }],
  });
  return TestBed.inject(LocaleState);
}

describe('LocaleState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  it('starts from the browser language and sets <html lang>', () => {
    const state = setup(memoryStorage(), ['es-MX', 'en']);
    expect(state.language()).toBe('es');
    expect(state.locale()).toBe('es-ES');
    expect(document.documentElement.lang).toBe('es');
  });

  it('prefers a saved choice, and a ?lang= link over both', () => {
    expect(
      setup(memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'es' })).language(),
    ).toBe('es');
    TestBed.resetTestingModule();
    history.replaceState(null, '', '/?lang=en');
    expect(
      setup(memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'es' })).language(),
    ).toBe('en');
  });

  it('switches language, remembers it and updates the document', () => {
    const storage = memoryStorage();
    const state = setup(storage);
    state.setLanguage('es');
    expect(state.language()).toBe('es');
    expect(state.locale()).toBe('es-ES');
    expect(document.documentElement.lang).toBe('es');
    expect(storage.get(LANGUAGE_STORAGE_KEY)).toBe('es');
  });

  it('ignores unsupported languages', () => {
    const state = setup();
    state.setLanguage('fr' as never);
    expect(state.language()).toBe('en');
  });

  it('works when storage throws', () => {
    const broken: KeyValueStorage = {
      get: () => {
        throw new Error('SecurityError');
      },
      set: () => {
        throw new Error('SecurityError');
      },
    };
    const state = setup(broken);
    expect(state.language()).toBe('en');
    state.setLanguage('es');
    expect(state.language()).toBe('es');
  });
});
