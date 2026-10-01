import { TestBed } from '@angular/core/testing';
import { DEFAULT_VIEW, type ScreenerView } from '@data-heavy/util';

import {
  type FilterChange,
  FilterPanel,
  SEARCH_DEBOUNCE_MS,
} from './filter-panel';

async function setup(view: ScreenerView = DEFAULT_VIEW) {
  const fixture = TestBed.createComponent(FilterPanel);
  fixture.componentRef.setInput('view', view);
  const changes: FilterChange[] = [];
  let cleared = 0;
  fixture.componentInstance.filterChange.subscribe((c) => changes.push(c));
  fixture.componentInstance.clearAll.subscribe(() => cleared++);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const range = (legend: string) =>
    Array.from(root.querySelectorAll('fieldset')).find(
      (f) => f.querySelector('legend')?.textContent?.trim() === legend,
    ) as HTMLFieldSetElement;
  return { fixture, root, changes, cleared: () => cleared, range };
}

function type(input: HTMLInputElement, value: string, commit = false) {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  if (commit) {
    input.dispatchEvent(new Event('change'));
  }
}

describe('FilterPanel', () => {
  afterEach(() => vi.useRealTimers());

  it('is a labelled search landmark with a labelled search box', async () => {
    const { root } = await setup();
    const form = root.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('role')).toBe('search');
    const input = root.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    expect(root.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(
      'Search',
    );
  });

  it('debounces search input and replaces the history entry', async () => {
    const { root, changes } = await setup();
    // After setup: Angular needs real timers to become stable.
    vi.useFakeTimers();
    const input = root.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;

    type(input, 'b');
    type(input, 'ba');
    type(input, 'bank');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([{ patch: { text: 'bank' }, replaceUrl: true }]);
  });

  it('commits a range on change, accepting suffixes', async () => {
    const { range, changes } = await setup();
    const [min, max] = Array.from(
      range('Market cap').querySelectorAll('input'),
    );
    type(min as HTMLInputElement, '500M');
    type(max as HTMLInputElement, '2B', true);
    expect(changes).toEqual([
      {
        patch: { ranges: { marketCapUsd: { min: 5e8, max: 2e9 } } },
        replaceUrl: false,
      },
    ]);
  });

  it('flags an invalid range, links the message and does not emit', async () => {
    const { fixture, range, changes } = await setup();
    const fieldset = range('Price');
    const [min, max] = Array.from(
      fieldset.querySelectorAll('input'),
    ) as HTMLInputElement[];
    type(min as HTMLInputElement, '50');
    type(max as HTMLInputElement, '10', true);
    await fixture.whenStable();

    expect(changes).toEqual([]);
    expect(max?.getAttribute('aria-invalid')).toBe('true');
    const message = fieldset.querySelector(
      `#${max?.getAttribute('aria-describedby')}`,
    );
    expect(message?.textContent).toContain('minimum not above the maximum');
  });

  it('keeps what the user is typing when another filter changes the URL', async () => {
    const { fixture, range } = await setup();
    const [, max] = Array.from(range('Price').querySelectorAll('input'));
    type(max as HTMLInputElement, '200'); // typed, not committed yet

    // The URL changes because another filter was committed.
    fixture.componentRef.setInput('view', {
      ...DEFAULT_VIEW,
      ranges: { peRatio: { max: 15 } },
    });
    await fixture.whenStable();
    expect((max as HTMLInputElement).value).toBe('200');

    // Committing the other bound of the same filter lands in the URL while Max is being typed.
    fixture.componentRef.setInput('view', {
      ...DEFAULT_VIEW,
      ranges: { price: { min: 1 } },
    });
    await fixture.whenStable();
    expect((max as HTMLInputElement).value).toBe('200');

    // When the bound itself changes in the URL, the draft follows the URL.
    fixture.componentRef.setInput('view', {
      ...DEFAULT_VIEW,
      ranges: { price: { min: 1, max: 50 } },
    });
    await fixture.whenStable();
    expect((max as HTMLInputElement).value).toBe('50');
  });

  it('clears a range when both inputs are emptied', async () => {
    const view = { ...DEFAULT_VIEW, ranges: { price: { min: 10 } } };
    const { range, changes } = await setup(view);
    const [min] = Array.from(range('Price').querySelectorAll('input'));
    expect((min as HTMLInputElement).value).toBe('10');
    type(min as HTMLInputElement, '', true);
    expect(changes).toEqual([{ patch: { ranges: {} }, replaceUrl: false }]);
  });

  it('renders one multi-select per enum filter with localised options', async () => {
    const { root } = await setup();
    const labels = Array.from(
      root.querySelectorAll('.dh-multi-select__label'),
    ).map((l) => l.textContent);
    expect(labels).toEqual(['Type', 'Exchange', 'Sector', 'Country']);
  });

  it('emits select changes, removing the key when nothing is selected', async () => {
    const view = {
      ...DEFAULT_VIEW,
      selects: { sector: ['Energy'], type: ['etf'] },
    };
    const { fixture, changes } = await setup(view);
    const panel = fixture.componentInstance as unknown as {
      onSelect(key: string, values: readonly string[]): void;
    };
    panel.onSelect('sector', []);
    panel.onSelect('exchange', ['TSE']);
    expect(changes.map((c) => c.patch.selects)).toEqual([
      { type: ['etf'] },
      { sector: ['Energy'], type: ['etf'], exchange: ['TSE'] },
    ]);
  });

  it('asks to clear all filters', async () => {
    const { root, cleared } = await setup();
    const button = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Clear filters',
    ) as HTMLButtonElement;
    button.click();
    expect(cleared()).toBe(1);
  });
});
