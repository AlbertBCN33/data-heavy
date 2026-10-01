import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { NetworkStatus } from '@data-heavy/data-access/network';
import { ToastOutlet, ToastService } from '@data-heavy/ui/toast';

@Component({
  selector: 'dh-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly network = inject(NetworkStatus);

  /** Screener stays active with any query string (filters, selection). */
  protected readonly screenerActiveOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  } as const;

  constructor() {
    this.offerUpdates();
  }

  /**
   * The service worker serves the cached version first. When a newer one has been downloaded,
   * let the user choose when to reload instead of swapping code under them.
   */
  private offerUpdates(): void {
    const updates = inject(SwUpdate);
    if (!updates.isEnabled) {
      return;
    }
    const toasts = inject(ToastService);
    const location = inject(DOCUMENT).location;
    const subscription = updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        toasts.show({
          message: 'A new version of the app is available.',
          durationMs: Infinity,
          action: { label: 'Reload', run: () => location.reload() },
        });
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
