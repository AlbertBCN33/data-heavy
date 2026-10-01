import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { TestBed } from '@angular/core/testing';
import {
  installJsdomPolyfills,
  provideTestTranslations,
  readWorkspaceJson,
} from '@data-heavy/ui/testing';
import type { TranslationObject } from '@ngx-translate/core';

setupTestBed();
installJsdomPolyfills();

// Specs run with the real English copy, so missing keys fail visibly.
const en = readWorkspaceJson<TranslationObject>(
  'apps/screener/src/assets/i18n/en.json',
);
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideTestTranslations(en)] });
});
