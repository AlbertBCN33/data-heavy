import { TestBed } from '@angular/core/testing';
import { generateInstruments, type SortSpec } from '@data-heavy/util';

import { NaiveTable } from './naive-table';

const rows = generateInstruments(9, 25);

async function setup() {
  const fixture = TestBed.createComponent(NaiveTable);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('columns', ['symbol', 'sector', 'price']);
  fixture.componentRef.setInput('sort', [{ key: 'price', dir: 'desc' }]);
  fixture.componentRef.setInput('label', 'Instruments');
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('NaiveTable', () => {
  it('renders every row, without virtualization', async () => {
    const { root } = await setup();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(root.querySelector('caption')?.textContent?.trim()).toBe(
      'Instruments',
    );
  });

  it('formats cells like the real grid', async () => {
    const { root } = await setup();
    const first = rows[0] as (typeof rows)[number];
    const cells = root.querySelectorAll('tbody tr:first-child td');
    expect(cells[0]?.textContent?.trim()).toBe(first.symbol);
    expect(cells[1]?.textContent?.trim()).toMatch(/^[A-Z]/); // translated sector label
  });

  it('emits sort changes and row activation', async () => {
    const { fixture, root } = await setup();
    const sorts: SortSpec[][] = [];
    const activated: string[] = [];
    fixture.componentInstance.sortChange.subscribe((s) => sorts.push(s));
    fixture.componentInstance.rowActivate.subscribe((id) => activated.push(id));

    (root.querySelector('thead button') as HTMLButtonElement).click();
    (root.querySelector('tbody tr') as HTMLElement).click();
    expect(sorts).toEqual([[{ key: 'symbol', dir: 'asc' }]]);
    expect(activated).toEqual([(rows[0] as (typeof rows)[number]).id]);
  });
});
