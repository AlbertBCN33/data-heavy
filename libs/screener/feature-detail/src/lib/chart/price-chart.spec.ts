import { TestBed } from '@angular/core/testing';
import type { PricePoint } from '@data-heavy/util';

import { PriceChart } from './price-chart';

const rising: PricePoint[] = [
  { date: '2026-09-28', close: 100 },
  { date: '2026-09-29', close: 120 },
  { date: '2026-09-30', close: 110 },
];

async function setup(points: readonly PricePoint[] = rising) {
  const fixture = TestBed.createComponent(PriceChart);
  fixture.componentRef.setInput('points', points);
  fixture.componentRef.setInput('currency', 'USD');
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

function pointer(target: Element, type: string, offsetX = 0) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'offsetX', { value: offsetX });
  target.dispatchEvent(event);
}

describe('PriceChart', () => {
  it('hides the drawing from assistive technology and captions it with a summary', async () => {
    const { root } = await setup();
    expect(root.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('figcaption')?.textContent).toContain(
      'Up +10.00%',
    );
  });

  it('draws the line and labels the extremes and date range', async () => {
    const { root } = await setup();
    expect(root.querySelector('.dh-chart__line')?.getAttribute('d')).toMatch(
      /^M0,/,
    );
    expect(
      root.querySelector('.dh-chart__label--high')?.textContent?.trim(),
    ).toBe('$120.00');
    expect(
      root.querySelector('.dh-chart__label--low')?.textContent?.trim(),
    ).toBe('$100.00');
    expect(root.querySelector('.dh-chart__axis')?.textContent).toContain(
      'Sep 28, 2026',
    );
  });

  it('colours a falling series differently', async () => {
    const { root } = await setup(
      [...rising]
        .reverse()
        .map((p, i) => ({ ...p, date: rising[i]?.date ?? p.date })),
    );
    expect(root.querySelector('figure')?.classList).toContain('dh-chart--down');
  });

  it('shows a crosshair read-out for the point under the pointer', async () => {
    const { fixture, root } = await setup();
    const plot = root.querySelector('.dh-chart__plot') as HTMLElement;
    Object.defineProperty(plot, 'clientWidth', { value: 300 });

    pointer(plot, 'pointermove', 160); // middle of 300px → second point
    await fixture.whenStable();
    expect(root.querySelector('.dh-chart__tooltip')?.textContent).toContain(
      '$120.00',
    );
    expect(root.querySelector('.dh-chart__crosshair')?.getAttribute('x1')).toBe(
      '300',
    );

    pointer(plot, 'pointerleave');
    await fixture.whenStable();
    expect(root.querySelector('.dh-chart__tooltip')).toBeNull();
  });

  it('ignores the pointer before layout and renders an empty plot without data', async () => {
    const { fixture, root } = await setup([]);
    expect(root.querySelector('svg')).toBeNull();
    expect(root.querySelector('figcaption')?.textContent).toBe(
      'No price data.',
    );

    fixture.componentRef.setInput('points', rising);
    await fixture.whenStable();
    pointer(
      root.querySelector('.dh-chart__plot') as HTMLElement,
      'pointermove',
      10,
    );
    await fixture.whenStable();
    expect(root.querySelector('.dh-chart__tooltip')).toBeNull(); // clientWidth is 0 in jsdom
  });
});
