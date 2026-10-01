import { TestBed } from '@angular/core/testing';

import { NetworkStatus } from './network-status';

describe('NetworkStatus', () => {
  let onLine = true;

  beforeEach(() => {
    onLine = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => onLine);
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts from navigator.onLine and follows online/offline events', () => {
    const status = TestBed.inject(NetworkStatus);
    expect(status.online()).toBe(true);

    onLine = false;
    window.dispatchEvent(new Event('offline'));
    expect(status.online()).toBe(false);

    onLine = true;
    window.dispatchEvent(new Event('online'));
    expect(status.online()).toBe(true);
  });

  it('stops listening when destroyed', () => {
    const status = TestBed.inject(NetworkStatus);
    TestBed.resetTestingModule();
    onLine = false;
    window.dispatchEvent(new Event('offline'));
    expect(status.online()).toBe(true);
  });
});
