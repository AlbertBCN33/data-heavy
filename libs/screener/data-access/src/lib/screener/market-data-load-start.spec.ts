import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MARKET_DATA_LOAD_START } from './market-data.store';

@Component({ template: '<p>rendered</p>' })
class Rendered {}

type PaintCallback = (list: { getEntries(): { name: string }[] }) => void;

describe('MARKET_DATA_LOAD_START (default)', () => {
  let paintCallback: PaintCallback | undefined;
  let disconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    paintCallback = undefined;
    disconnect = vi.fn();
    class FakeObserver {
      static supportedEntryTypes = ['paint'];
      constructor(callback: PaintCallback) {
        paintCallback = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function startAfterRender() {
    const start = vi.fn();
    TestBed.inject(MARKET_DATA_LOAD_START)(start);
    TestBed.createComponent(Rendered);
    await TestBed.inject(ApplicationRef).whenStable();
    TestBed.inject(ApplicationRef).tick();
    return start;
  }

  it('waits for the first render and the first contentful paint', async () => {
    const start = await startAfterRender();
    expect(start).not.toHaveBeenCalled();

    paintCallback?.({ getEntries: () => [{ name: 'first-paint' }] });
    expect(start).not.toHaveBeenCalled();

    paintCallback?.({ getEntries: () => [{ name: 'first-contentful-paint' }] });
    expect(start).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();

    vi.runAllTimers(); // the fallback does not start it twice
    expect(start).toHaveBeenCalledOnce();
  });

  it('falls back to a short timeout when no paint entry arrives', async () => {
    const start = await startAfterRender();
    vi.advanceTimersByTime(300);
    expect(start).toHaveBeenCalledOnce();
  });

  it('uses only the timeout where paint timing is unsupported', async () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    const start = await startAfterRender();
    expect(paintCallback).toBeUndefined();
    vi.advanceTimersByTime(300);
    expect(start).toHaveBeenCalledOnce();
  });
});
