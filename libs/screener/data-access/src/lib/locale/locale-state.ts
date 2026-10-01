import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import {
  isLanguageCode,
  type LanguageCode,
  localeFor,
  resolveLanguage,
} from '@data-heavy/util';

import { KEY_VALUE_STORAGE } from '../key-value-storage';

export const LANGUAGE_STORAGE_KEY = 'dh.lang';

/**
 * The UI language and the matching formatting locale. Framework-level state only: it knows
 * nothing about the translation library. The app reacts to `language` by loading translations;
 * features read `locale` for numbers, currencies and dates.
 */
@Injectable({ providedIn: 'root' })
export class LocaleState {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(KEY_VALUE_STORAGE);
  private readonly current = signal<LanguageCode>(this.initialLanguage());

  readonly language = this.current.asReadonly();
  readonly locale = computed(() => localeFor(this.current()));

  constructor() {
    this.document.documentElement.lang = this.current();
  }

  /** Switches the language, remembers the choice and updates `<html lang>`. */
  setLanguage(code: LanguageCode): void {
    if (!isLanguageCode(code)) {
      return;
    }
    this.current.set(code);
    this.document.documentElement.lang = code;
    try {
      this.storage.set(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // Not persisted (storage unavailable): the choice still applies for this session.
    }
  }

  private initialLanguage(): LanguageCode {
    const view = this.document.defaultView;
    let stored: string | null = null;
    try {
      stored = this.storage.get(LANGUAGE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    return resolveLanguage({
      urlParam: view
        ? new URLSearchParams(view.location.search).get('lang')
        : null,
      stored,
      browser: view?.navigator.languages ?? [],
    });
  }
}
