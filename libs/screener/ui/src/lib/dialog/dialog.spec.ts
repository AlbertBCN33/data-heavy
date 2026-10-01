import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Dialog } from './dialog';

@Component({
  imports: [Dialog],
  template: `
    <button id="opener" type="button" (click)="open.set(true)">Open</button>
    <dh-dialog
      [(open)]="open"
      label="Instrument details"
      closeLabel="Close details"
      [variant]="variant()"
    >
      <p id="content">Body</p>
      <div dhDialogFooter id="footer">Footer</div>
    </dh-dialog>
  `,
})
class Host {
  readonly open = signal(false);
  readonly variant = signal<'modal' | 'drawer'>('modal');
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    dialog: root.querySelector('dialog') as HTMLDialogElement,
    opener: root.querySelector('#opener') as HTMLButtonElement,
    closeButton: root.querySelector('.dh-dialog__close') as HTMLButtonElement,
  };
}

describe('Dialog', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('is labelled by its visible title and projects body and footer', async () => {
    const { dialog } = await setup();
    const title = dialog.querySelector('h2') as HTMLElement;
    expect(title.textContent).toBe('Instrument details');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(dialog.querySelector('.dh-dialog__body #content')).not.toBeNull();
    expect(dialog.querySelector('#footer')).not.toBeNull();
  });

  it('gives the close button an accessible name', async () => {
    const { closeButton } = await setup();
    expect(closeButton.textContent).toContain('Close details');
    expect(closeButton.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('opens modally when the model becomes true', async () => {
    const { fixture, host, dialog } = await setup();
    const showModal = vi.spyOn(dialog, 'showModal');
    host.open.set(true);
    await fixture.whenStable();
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
  });

  it('closes from the close button and returns focus to the opener', async () => {
    const { fixture, host, dialog, opener, closeButton } = await setup();
    opener.focus();
    opener.click();
    await fixture.whenStable();

    closeButton.click();
    await fixture.whenStable();

    expect(host.open()).toBe(false);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('syncs the model when the browser closes it (Escape)', async () => {
    const { fixture, host, dialog } = await setup();
    host.open.set(true);
    await fixture.whenStable();

    dialog.close(); // what the browser does on Escape
    await fixture.whenStable();
    expect(host.open()).toBe(false);
  });

  it('closes on a backdrop click but not on a click inside the content', async () => {
    const { fixture, host, dialog } = await setup();
    host.open.set(true);
    await fixture.whenStable();

    (dialog.querySelector('#content') as HTMLElement).click();
    await fixture.whenStable();
    expect(host.open()).toBe(true);

    dialog.click();
    await fixture.whenStable();
    expect(host.open()).toBe(false);
  });

  it('does not throw when the opener is gone after closing', async () => {
    const { fixture, host, opener } = await setup();
    opener.focus();
    host.open.set(true);
    await fixture.whenStable();
    opener.remove();

    host.open.set(false);
    await expect(fixture.whenStable()).resolves.not.toThrow();
  });

  it('renders as a drawer when requested', async () => {
    const { fixture, host, dialog } = await setup();
    host.variant.set('drawer');
    await fixture.whenStable();
    expect(dialog.classList).toContain('dh-dialog--drawer');
  });
});
