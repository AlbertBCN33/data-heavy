import {
  computed,
  effect,
  type EnvironmentProviders,
  inject,
  Injectable,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideEnvironmentInitializer,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { LocaleState } from '@data-heavy/data-access/locale';
import { TOAST_LABELS } from '@data-heavy/ui/toast';
import { DEFAULT_LANGUAGE } from '@data-heavy/util';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

/**
 * Route titles are translation keys (`titles.screener`); this strategy translates them and
 * re-applies the title when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translate = inject(TranslateService);
  private key: string | undefined;

  constructor() {
    super();
    effect(() => {
      this.translate.currentLang();
      this.apply();
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.apply();
  }

  private apply(): void {
    if (this.key) {
      this.title.setTitle(this.translate.instant(this.key) as string);
    }
  }
}

/**
 * Runtime translations with @ngx-translate:
 * - JSON files in `src/assets/i18n/`, loaded over HTTP (and cached by the service worker).
 * - The active language is loaded before the first render, so keys never flash on screen.
 * - `LocaleState` is the source of truth for the language; translations follow it.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTranslateService({
      fallbackLang: DEFAULT_LANGUAGE,
      loader: provideTranslateHttpLoader({
        prefix: 'assets/i18n/',
        suffix: '.json',
      }),
    }),
    provideAppInitializer(() =>
      firstValueFrom(
        inject(TranslateService).use(inject(LocaleState).language()),
      ),
    ),
    provideEnvironmentInitializer(() => {
      const locale = inject(LocaleState);
      const translate = inject(TranslateService);
      effect(() => {
        const language = locale.language();
        if (translate.getCurrentLang() !== language) {
          translate.use(language).subscribe();
        }
      });
    }),
    { provide: TitleStrategy, useExisting: TranslatedTitleStrategy },
    {
      provide: TOAST_LABELS,
      useFactory: () => {
        const translate = inject(TranslateService);
        return computed(() => {
          translate.currentLang();
          return {
            dismiss: translate.instant('toast.dismiss') as string,
            region: translate.instant('toast.region') as string,
          };
        });
      },
    },
  ]);
}
