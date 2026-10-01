import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { LocaleState } from '@data-heavy/data-access/locale';
import { NetworkStatus } from '@data-heavy/data-access/network';
import { ToastOutlet, ToastService } from '@data-heavy/ui/toast';
import { isLanguageCode, LANGUAGES } from '@data-heavy/util';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'dh-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToastOutlet,
    TranslatePipe,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly network = inject(NetworkStatus);
  protected readonly locale = inject(LocaleState);
  protected readonly languages = LANGUAGES;
  private readonly translate = inject(TranslateService);

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

  protected onLanguageChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    if (isLanguageCode(code)) {
      this.locale.setLanguage(code);
    }
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
          message: this.translate.instant('app.updateAvailable') as string,
          durationMs: Infinity,
          action: {
            label: this.translate.instant('app.reload') as string,
            run: () => location.reload(),
          },
        });
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
