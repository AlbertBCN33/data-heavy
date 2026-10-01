import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type ColumnKey,
  generateInstruments,
  type Instrument,
  type SortSpec,
} from '@data-heavy/util';

import { ScreenerTable } from './screener-table';

const rows = generateInstruments(11, 30);

@Component({
  imports: [ScreenerTable],
  template: `
    <div style="height: 400px">
      <dh-screener-table
        label="Instruments"
        [rows]="rows()"
        [columns]="columns()"
        [sort]="sort()"
        [selectedId]="selected()"
        [loading]="loading()"
        (sortChange)="sorts.push($event)"
        (rowActivate)="activated.push($event)"
      />
    </div>
  `,
})
class Host {
  readonly rows = signal<readonly Instrument[]>(rows);
  readonly columns = signal<readonly ColumnKey[]>([
    'symbol',
    'name',
    'sector',
    'price',
    'changePct',
  ]);
  readonly sort = signal<readonly SortSpec[]>([{ key: 'price', dir: 'desc' }]);
  readonly selected = signal<string | null>(null);
  readonly loading = signal(false);
  readonly sorts: SortSpec[][] = [];
  readonly activated: string[] = [];
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    grid: root.querySelector('[role="grid"]') as HTMLElement,
    headers: () =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="columnheader"]')),
  };
}

const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }),
  );

describe('ScreenerTable', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('exposes grid semantics with the full row and column counts', async () => {
    const { grid, headers } = await setup();
    expect(grid.getAttribute('aria-label')).toBe('Instruments');
    expect(grid.getAttribute('aria-rowcount')).toBe('31');
    expect(grid.getAttribute('aria-colcount')).toBe('5');
    expect(grid.getAttribute('aria-busy')).toBe('false');
    expect(headers().map((h) => h.textContent?.trim().split(/\s/)[0])).toEqual([
      'Symbol',
      'Name',
      'Sector',
      'Price',
      'Change',
    ]);
    expect(headers().map((h) => h.getAttribute('aria-colindex'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });

  it('marks the primary sort column with aria-sort and labels secondary keys', async () => {
    const { fixture, host, headers } = await setup();
    expect(headers()[3]?.getAttribute('aria-sort')).toBe('descending');
    expect(headers()[0]?.hasAttribute('aria-sort')).toBe(false);

    host.sort.set([
      { key: 'price', dir: 'desc' },
      { key: 'name', dir: 'asc' },
    ]);
    await fixture.whenStable();
    expect(headers()[1]?.hasAttribute('aria-sort')).toBe(false);
    expect(headers()[1]?.textContent).toContain('sort 2');
  });

  it('emits a new sort when a header is clicked, adding a tie-breaker with Shift', async () => {
    const { host, headers } = await setup();
    headers()[1]?.click();
    headers()[1]?.dispatchEvent(
      new MouseEvent('click', { shiftKey: true, bubbles: true }),
    );
    expect(host.sorts).toEqual([
      [{ key: 'name', dir: 'asc' }],
      [
        { key: 'price', dir: 'desc' },
        { key: 'name', dir: 'asc' },
      ],
    ]);
  });

  it('shows skeleton rows and marks the grid busy while loading', async () => {
    const { fixture, host, grid } = await setup();
    host.loading.set(true);
    await fixture.whenStable();
    expect(grid.getAttribute('aria-busy')).toBe('true');
    expect(grid.getAttribute('aria-rowcount')).toBe('-1');
    expect(grid.querySelectorAll('dh-skeleton').length).toBeGreaterThan(0);
  });

  it('has a single tab stop that starts on the first header', async () => {
    const { grid } = await setup();
    const tabbable = grid.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]?.getAttribute('role')).toBe('columnheader');
  });

  it('moves the tab stop with the arrow keys and sorts with Enter on a header', async () => {
    const { fixture, host, grid, headers } = await setup();
    const first = headers()[0] as HTMLElement;

    key(first, 'ArrowRight');
    await fixture.whenStable();
    expect(headers()[1]?.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');

    key(headers()[1] as HTMLElement, 'Enter');
    expect(host.sorts.at(-1)).toEqual([{ key: 'name', dir: 'asc' }]);

    key(headers()[1] as HTMLElement, ' ', { shiftKey: true });
    expect(host.sorts.at(-1)).toEqual([
      { key: 'price', dir: 'desc' },
      { key: 'name', dir: 'asc' },
    ]);
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('ignores keys that are not navigation or activation keys', async () => {
    const { host, headers } = await setup();
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true,
    });
    headers()[0]?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(host.sorts).toEqual([]);
  });

  describe('rows (rendered by the virtual scroller)', () => {
    // jsdom has no layout, so the CDK viewport renders nothing. Row behaviour is exercised in the
    // Playwright journeys; here we check the output wiring the template relies on.
    it('activates a row by id', async () => {
      const { fixture } = await setup();
      const table = fixture.debugElement.children[0]?.children[0]
        ?.componentInstance as ScreenerTable;
      const row = rows[0] as Instrument;
      const emitted: string[] = [];
      table.rowActivate.subscribe((id) => emitted.push(id));
      // protected handler, invoked as the template would on click
      (
        table as unknown as {
          onRowClick(e: MouseEvent, r: number, id: string): void;
        }
      ).onRowClick(
        { target: document.createElement('div') } as unknown as MouseEvent,
        0,
        row.id,
      );
      expect(emitted).toEqual([row.id]);
    });
  });
});
