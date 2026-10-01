import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { COLUMN_KEYS, type ColumnKey, DEFAULT_COLUMNS } from '@data-heavy/util';

import { ColumnPicker, toChoices } from './column-picker';

async function setup(
  columns: readonly ColumnKey[] = ['symbol', 'name', 'price'],
) {
  const announce = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [{ provide: LiveAnnouncer, useValue: { announce } }],
  });
  const fixture = TestBed.createComponent(ColumnPicker);
  fixture.componentRef.setInput('columns', columns);
  const applied: ColumnKey[][] = [];
  fixture.componentInstance.columnsChange.subscribe((c) => applied.push(c));
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
    ) as HTMLButtonElement;
  const open = async () => {
    button('Columns').click();
    await fixture.whenStable();
  };
  const order = () =>
    Array.from(root.querySelectorAll('.dh-columns__toggle')).map((l) =>
      l.textContent?.trim(),
    );
  return { fixture, root, applied, announce, button, open, order };
}

describe('toChoices', () => {
  it('lists visible columns first, then the hidden ones in registry order', () => {
    const choices = toChoices(['symbol', 'price']);
    expect(choices.slice(0, 2)).toEqual([
      { key: 'symbol', visible: true },
      { key: 'price', visible: true },
    ]);
    expect(choices).toHaveLength(COLUMN_KEYS.length);
    expect(choices.slice(2).every((c) => !c.visible)).toBe(true);
  });
});

describe('ColumnPicker', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('opens a dialog listing every column, with Symbol pinned', async () => {
    const { root, open, order } = await setup();
    await open();
    expect(root.querySelector('dialog')?.open).toBe(true);
    expect(order().slice(0, 3)).toEqual(['Symbol', 'Name', 'Price']);
    const symbol = root.querySelector(
      '.dh-columns__toggle input',
    ) as HTMLInputElement;
    expect(symbol.disabled).toBe(true);
  });

  it('applies visibility and order changes in one step', async () => {
    const { fixture, root, applied, button, open, order } = await setup();
    await open();

    const toggles = Array.from(
      root.querySelectorAll<HTMLInputElement>('.dh-columns__toggle input'),
    );
    toggles[1]?.click(); // hide Name
    button('Move Price up').click();
    await fixture.whenStable();
    expect(order().slice(0, 3)).toEqual(['Symbol', 'Price', 'Name']);
    expect(applied).toEqual([]);

    button('Apply').click();
    await fixture.whenStable();
    expect(applied).toEqual([['symbol', 'price']]);
    expect(root.querySelector('dialog')?.open).toBe(false);
  });

  it('announces moves and keeps focus on the moved column', async () => {
    const { fixture, announce, button, open } = await setup();
    await open();
    button('Move Price up').click();
    await fixture.whenStable();

    expect(announce).toHaveBeenCalledWith(
      `Price moved to position 2 of ${COLUMN_KEYS.length}`,
    );
    // Price is now second: "up" is disabled at that edge, so focus moves to "down".
    expect(document.activeElement).toBe(button('Move Price down'));
  });

  it('never moves a column above the pinned one or past the end', async () => {
    const { fixture, button, open, order } = await setup();
    await open();
    expect(button('Move Name up').disabled).toBe(true);
    const lastLabel = order().at(-1) as string;
    expect(button(`Move ${lastLabel} down`).disabled).toBe(true);
    const before = order();
    (
      fixture.componentInstance as unknown as {
        move(i: number, d: number): void;
      }
    ).move(1, -1);
    await fixture.whenStable();
    expect(order()).toEqual(before);
  });

  it('discards the draft on cancel and can reset to the defaults', async () => {
    const { fixture, applied, button, open, order } = await setup();
    await open();
    button('Reset to default').click();
    await fixture.whenStable();
    expect(order().slice(0, DEFAULT_COLUMNS.length)).toEqual([
      'Symbol',
      'Name',
      'Exchange',
      'Sector',
      'Price',
      'Change',
      'Volume',
      'Market cap',
      'P/E',
    ]);
    button('Cancel').click();
    await fixture.whenStable();
    expect(applied).toEqual([]);

    await open();
    expect(order().slice(0, 3)).toEqual(['Symbol', 'Name', 'Price']);
  });
});
