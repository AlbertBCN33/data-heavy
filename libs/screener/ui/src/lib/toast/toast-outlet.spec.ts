import { TestBed } from '@angular/core/testing';

import { ToastOutlet } from './toast-outlet';
import { ToastService } from './toast.service';

async function setup() {
  const fixture = TestBed.createComponent(ToastOutlet);
  fixture.componentRef.setInput('dismissLabel', 'Cerrar');
  fixture.componentRef.setInput('regionLabel', 'Notificaciones');
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    service: TestBed.inject(ToastService),
    root,
    polite: root.querySelector('[aria-live="polite"]') as HTMLElement,
    assertive: root.querySelector('[aria-live="assertive"]') as HTMLElement,
  };
}

describe('ToastOutlet', () => {
  it('renders both live regions up front, inside a labelled region', async () => {
    const { root, polite, assertive } = await setup();
    expect(root.querySelector('section')?.getAttribute('aria-label')).toBe(
      'Notificaciones',
    );
    expect(polite.children).toHaveLength(0);
    expect(assertive.children).toHaveLength(0);
  });

  it('announces errors assertively and everything else politely', async () => {
    const { fixture, service, polite, assertive } = await setup();
    service.show({ message: 'Added to watchlist', kind: 'success' });
    service.show({ message: 'Could not save', kind: 'error' });
    await fixture.whenStable();

    expect(polite.textContent).toContain('Added to watchlist');
    expect(assertive.textContent).toContain('Could not save');
    expect(polite.textContent).not.toContain('Could not save');
  });

  it('runs the action from its button', async () => {
    const { fixture, service, polite } = await setup();
    const run = vi.fn();
    service.show({ message: 'Removed', action: { label: 'Deshacer', run } });
    await fixture.whenStable();

    const action = Array.from(polite.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Deshacer',
    ) as HTMLButtonElement;
    action.click();
    await fixture.whenStable();

    expect(run).toHaveBeenCalledOnce();
    expect(polite.children).toHaveLength(0);
  });

  it('dismisses from a labelled dismiss button', async () => {
    const { fixture, service, polite } = await setup();
    service.show({ message: 'Saved' });
    await fixture.whenStable();

    const dismiss = polite.querySelector(
      '.dh-toast__dismiss',
    ) as HTMLButtonElement;
    expect(dismiss.getAttribute('aria-label')).toBe('Cerrar');
    dismiss.click();
    await fixture.whenStable();
    expect(service.toasts()).toHaveLength(0);
  });

  it('pauses while hovered or focused and resumes afterwards', async () => {
    const { fixture, service, polite } = await setup();
    const id = service.show({ message: 'Saved' });
    // Spy after show(): it calls resume() itself to start the countdown.
    const pause = vi.spyOn(service, 'pause');
    const resume = vi.spyOn(service, 'resume');
    await fixture.whenStable();

    const toast = polite.querySelector('.dh-toast') as HTMLElement;
    toast.dispatchEvent(new MouseEvent('mouseenter'));
    toast.dispatchEvent(new MouseEvent('mouseleave'));
    toast.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    toast.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(pause.mock.calls).toEqual([[id], [id]]);
    expect(resume.mock.calls).toEqual([[id], [id]]);
  });
});
