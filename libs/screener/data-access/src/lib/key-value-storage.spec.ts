import { TestBed } from '@angular/core/testing';

import {
  browserStorage,
  KEY_VALUE_STORAGE,
  memoryStorage,
} from './key-value-storage';
import { isMarketDataError, MarketDataError } from './market-data-error';

describe('memoryStorage', () => {
  it('stores and returns values, seeded from an initial record', () => {
    const storage = memoryStorage({ a: '1' });
    expect(storage.get('a')).toBe('1');
    expect(storage.get('b')).toBeNull();
    storage.set('b', '2');
    expect(storage.get('b')).toBe('2');
  });
});

describe('browserStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses localStorage when it is available', () => {
    const storage = browserStorage();
    storage.set('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(storage.get('k')).toBe('v');
  });

  it('falls back to memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const storage = browserStorage();
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('is the default KEY_VALUE_STORAGE', () => {
    TestBed.inject(KEY_VALUE_STORAGE).set('injected', 'yes');
    expect(localStorage.getItem('injected')).toBe('yes');
  });
});

describe('MarketDataError', () => {
  it('marks only network errors as retryable', () => {
    expect(new MarketDataError('network', 'x').retryable).toBe(true);
    expect(new MarketDataError('invalid-data', 'x').retryable).toBe(false);
    expect(isMarketDataError(new MarketDataError('aborted', 'x'))).toBe(true);
    expect(isMarketDataError(new Error('x'))).toBe(false);
  });
});
