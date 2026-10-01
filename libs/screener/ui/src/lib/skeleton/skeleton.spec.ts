import { TestBed } from '@angular/core/testing';

import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('is hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(Skeleton);
    await fixture.whenStable();
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies its shape and size', async () => {
    const fixture = TestBed.createComponent(Skeleton);
    fixture.componentRef.setInput('shape', 'circle');
    fixture.componentRef.setInput('width', '2rem');
    fixture.componentRef.setInput('height', '2rem');
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).toContain('dh-skeleton--circle');
    expect(host.style.inlineSize).toBe('2rem');
    expect(host.style.blockSize).toBe('2rem');
  });

  it('defaults to a full-width line of text', async () => {
    const fixture = TestBed.createComponent(Skeleton);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).toContain('dh-skeleton--text');
    expect(host.style.inlineSize).toBe('100%');
  });
});
