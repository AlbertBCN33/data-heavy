import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { MarketDataPort } from './market-data.port';
import { provideMarketData } from './provide-market-data';
import { SimulatedLatencyAdapter } from './simulated-latency.adapter';
import { MARKET_SNAPSHOT_URL, StaticJsonAdapter } from './static-json.adapter';

function portFor(config?: Parameters<typeof provideMarketData>[0]) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideMarketData(config)],
  });
  return TestBed.inject(MarketDataPort);
}

describe('provideMarketData', () => {
  it('provides the static JSON adapter by default', () => {
    expect(portFor()).toBeInstanceOf(StaticJsonAdapter);
  });

  it('wraps the static adapter when simulation is enabled', () => {
    expect(
      portFor({ simulate: { latencyMs: [0, 0], failureRate: 0 } }),
    ).toBeInstanceOf(SimulatedLatencyAdapter);
  });

  it('does not simulate when simulation is explicitly disabled', () => {
    expect(portFor({ simulate: false })).toBeInstanceOf(StaticJsonAdapter);
  });

  it('can point the static adapter at another snapshot', () => {
    portFor({ snapshotUrl: 'data/market-snapshot-50k.json' });
    expect(TestBed.inject(MARKET_SNAPSHOT_URL)).toBe(
      'data/market-snapshot-50k.json',
    );
  });
});
