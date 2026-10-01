import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Button, type ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <button
      dhButton
      [variant]="variant()"
      [loading]="loading()"
      (click)="clicks.set(clicks() + 1)"
    >
      Save
    </button>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('primary');
  readonly loading = signal(false);
  readonly clicks = signal(0);
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const button = fixture.nativeElement.querySelector(
    'button',
  ) as HTMLButtonElement;
  return { fixture, host: fixture.componentInstance, button };
}

describe('Button', () => {
  it('keeps native button semantics and applies variant and size classes', async () => {
    const { button } = await setup();
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent?.trim()).toBe('Save');
    expect(button.classList).toContain('dh-button');
    expect(button.classList).toContain('dh-button--primary');
    expect(button.classList).toContain('dh-button--md');
  });

  it('forwards clicks when idle', async () => {
    const { host, button } = await setup();
    button.click();
    expect(host.clicks()).toBe(1);
  });

  it('marks itself busy, stays focusable and swallows clicks while loading', async () => {
    const { fixture, host, button } = await setup();
    host.loading.set(true);
    await fixture.whenStable();

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.querySelector('.dh-button__spinner')).not.toBeNull();

    button.click();
    expect(host.clicks()).toBe(0);
  });

  it('removes busy attributes when loading ends', async () => {
    const { fixture, host, button } = await setup();
    host.loading.set(true);
    await fixture.whenStable();
    host.loading.set(false);
    await fixture.whenStable();

    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('updates the variant class', async () => {
    const { fixture, host, button } = await setup();
    host.variant.set('danger');
    await fixture.whenStable();
    expect(button.classList).toContain('dh-button--danger');
    expect(button.classList).not.toContain('dh-button--primary');
  });
});
