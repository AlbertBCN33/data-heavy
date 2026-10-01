import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker, SwUpdate } from '@angular/service-worker';
import { ToastService } from '@data-heavy/ui/toast';
import { Subject } from 'rxjs';

import { App } from './app';

function setup(swUpdate?: Partial<SwUpdate>) {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ...(swUpdate ? [{ provide: SwUpdate, useValue: swUpdate }] : []),
    ],
  });
  return TestBed.createComponent(App);
}

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mounts the toast outlet with its live regions', async () => {
    const fixture = setup();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('dh-toast-outlet [aria-live="polite"]'),
    ).not.toBeNull();
  });

  it('renders a skip link that targets the main landmark', async () => {
    const fixture = setup();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
    expect(el.querySelector('main#main')).not.toBeNull();
  });

  it('has a labelled main navigation', async () => {
    const fixture = setup();
    await fixture.whenStable();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Main');
    expect(
      Array.from(nav?.querySelectorAll('a') ?? []).map((a) =>
        a.textContent?.trim(),
      ),
    ).toEqual(['Screener', 'Watchlist']);
  });

  it('announces when the browser goes offline', async () => {
    let online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    const fixture = setup();
    await fixture.whenStable();
    const status = (fixture.nativeElement as HTMLElement).querySelector(
      '.app-offline',
    ) as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent?.trim()).toBe('');

    online = false;
    window.dispatchEvent(new Event('offline'));
    await fixture.whenStable();
    expect(status.textContent).toContain("You're offline.");
  });

  it('offers a reload when a new version is ready', async () => {
    const versionUpdates = new Subject<{ type: string }>();
    const fixture = setup({
      isEnabled: true,
      versionUpdates,
    } as unknown as SwUpdate);
    await fixture.whenStable();
    versionUpdates.next({ type: 'VERSION_DETECTED' });
    versionUpdates.next({ type: 'VERSION_READY' });
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      message: 'A new version of the app is available.',
      action: { label: 'Reload' },
      durationMs: Infinity,
    });
  });
});
