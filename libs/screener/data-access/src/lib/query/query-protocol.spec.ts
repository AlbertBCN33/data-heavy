import {
  generateInstruments,
  type ScreenerQuery,
  type SortSpec,
} from '@data-heavy/util';

import { createQueryHandler, type QueryResponse } from './query-protocol';

const rows = generateInstruments(3, 50);
const query: ScreenerQuery = {
  text: '',
  ranges: {},
  selects: { type: ['etf'] },
  sort: [{ key: 'price', dir: 'asc' }],
};

function setup() {
  const sent: { response: QueryResponse; transfer: Transferable[] }[] = [];
  let clock = 0;
  const handle = createQueryHandler(
    (response, transfer) => sent.push({ response, transfer }),
    () => (clock += 5),
  );
  return { handle, sent };
}

describe('createQueryHandler', () => {
  it('answers queries against the loaded dataset and transfers the result buffer', () => {
    const { handle, sent } = setup();
    handle({ type: 'load', rows });
    handle({ type: 'query', id: 7, query });

    const [{ response, transfer }] = sent as [(typeof sent)[number]];
    expect(response.type).toBe('result');
    if (response.type !== 'result') return;
    expect(response.id).toBe(7);
    expect(response.durationMs).toBe(5);
    expect(transfer).toEqual([response.indexes.buffer]);

    const matched = Array.from(response.indexes, (i) => rows[i]);
    expect(matched.every((r) => r?.type === 'etf')).toBe(true);
    const prices = matched.map((r) => r?.price ?? 0);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('reports an error for queries before a dataset is loaded', () => {
    const { handle, sent } = setup();
    handle({ type: 'query', id: 1, query });
    expect(sent[0]?.response).toEqual({
      type: 'error',
      id: 1,
      message: 'No dataset loaded',
    });
  });

  it('reports engine failures as errors instead of crashing the worker', () => {
    const { handle, sent } = setup();
    handle({ type: 'load', rows });
    const broken = {
      ...query,
      sort: [{ key: 'nope', dir: 'asc' } as unknown as SortSpec],
    };
    handle({ type: 'query', id: 2, query: broken });
    expect(sent[0]?.response.type).toBe('error');
    expect(sent[0]?.transfer).toEqual([]);
  });

  it('reports non-Error throwables as errors too', () => {
    const { handle, sent } = setup();
    handle({ type: 'load', rows });
    const throwing = {
      ...query,
      get sort(): never {
        throw 'boom';
      },
    };
    handle({ type: 'query', id: 3, query: throwing });
    expect(sent[0]?.response).toEqual({
      type: 'error',
      id: 3,
      message: 'boom',
    });
  });
});
