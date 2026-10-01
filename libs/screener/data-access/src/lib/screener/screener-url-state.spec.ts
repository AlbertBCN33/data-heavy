import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DEFAULT_VIEW } from '@data-heavy/util';

import { ScreenerUrlState } from './screener-url-state';

async function setup(url = '/') {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  return {
    router,
    state: TestBed.inject(ScreenerUrlState),
  };
}

describe('ScreenerUrlState', () => {
  it('decodes the initial URL into a view', async () => {
    const { state } = await setup('/?q=bank&sector=Energy&sort=-price');
    expect(state.view()).toMatchObject({
      text: 'bank',
      selects: { sector: ['Energy'] },
      sort: [{ key: 'price', dir: 'desc' }],
    });
    expect(state.issues()).toEqual([]);
  });

  it('reports params it had to drop', async () => {
    const { state } = await setup('/?price=cheap');
    expect(state.view().ranges).toEqual({});
    expect(state.issues()).toEqual([
      { param: 'price', reason: 'invalid-range' },
    ]);
  });

  it('writes updates to the URL, keeping params owned by other features', async () => {
    const { state, router } = await setup('/?lang=es&q=old');
    state.update({ text: 'new', sort: [{ key: 'symbol', dir: 'asc' }] });
    await new Promise((r) => setTimeout(r));

    expect(router.url).toBe('/?lang=es&q=new&sort=symbol');
    expect(state.view().text).toBe('new');
  });

  it('follows navigation to a different URL', async () => {
    const { state, router } = await setup('/');
    await router.navigateByUrl('/?q=first');
    await router.navigateByUrl('/?q=second');
    expect(state.view().text).toBe('second');

    await router.navigateByUrl('/?q=first');
    expect(state.view().text).toBe('first');
  });

  it('writes a complete view and can replace the history entry', async () => {
    const { state, router } = await setup('/?q=x&sector=Energy');
    const navigate = vi.spyOn(router, 'navigate');
    state.navigate(DEFAULT_VIEW, { replaceUrl: true });
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: {},
      replaceUrl: true,
    });
  });

  it('keeps the same view object when only foreign params change', async () => {
    const { state, router } = await setup('/?q=bank');
    const before = state.view();
    await router.navigateByUrl('/?q=bank&lang=es');
    expect(state.view()).toBe(before);
  });
});
