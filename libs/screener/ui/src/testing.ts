// Test-only helpers for consumers of @data-heavy/ui. Import from test setup files, never from app code.
import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import {
  provideTranslateService,
  type TranslationObject,
  TranslateService,
} from '@ngx-translate/core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * jsdom lacks modal dialogs and scrolling. These shims mimic only what the ui components rely on
 * (the `open` attribute, the `close` event, a no-op `scrollIntoView`); real focus and top-layer
 * behaviour is covered by e2e tests.
 */
export function installJsdomPolyfills(): void {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
    ) {
      if (this.hasAttribute('open')) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      }
    };
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => undefined;
  }
}

/**
 * Translations for unit tests. Missing keys render as the key itself, so specs can assert on keys
 * (decoupled from copy); pass a small dictionary where interpolated values matter. Real copy in
 * both languages is covered by the e2e journeys and the translation parity test.
 */
export function provideTestTranslations(
  translations: TranslationObject = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
    provideEnvironmentInitializer(() => {
      const translate = inject(TranslateService);
      translate.setTranslation('en', translations);
      translate.use('en');
    }),
  ]);
}

/**
 * Reads a JSON file relative to the workspace root (test setup only). Uses Nx's
 * `NX_WORKSPACE_ROOT`, or walks up from the current directory to `nx.json`.
 */
export function readWorkspaceJson<T = unknown>(relativePath: string): T {
  let root = process.env['NX_WORKSPACE_ROOT'];
  if (!root) {
    let dir = process.cwd();
    while (!existsSync(join(dir, 'nx.json')) && dirname(dir) !== dir) {
      dir = dirname(dir);
    }
    root = dir;
  }
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T;
}
