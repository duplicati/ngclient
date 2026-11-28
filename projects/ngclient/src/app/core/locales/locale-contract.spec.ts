import { getLocaleId, getLocaleExtraDayPeriods, FormStyle, TranslationWidth } from '@angular/common';
import zhHansExtra from '@angular/common/locales/extra/zh-Hans';
import zhHantExtra from '@angular/common/locales/extra/zh-Hant';
import { clearTranslations } from '@angular/localize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANGULAR_MJS_LOCALE_MAP,
  DEFAULT_LOCALE,
  getLocale,
  LANGUAGES,
  mapLocale,
  resolveLocale,
  whenTranslationsReady,
} from './locales.utility';
import contract from './testing/locale-contract.json';

// Frozen from the pre-refactor implementation, rather than derived from the catalog.
describe('existing locale contracts', () => {
  let stored: string | null;
  let originalLocale: string | undefined;
  beforeEach(() => {
    stored = null;
    originalLocale = $localize.locale;
    vi.stubGlobal('localStorage', { getItem: () => stored });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ translations: {} }) }));
  });
  afterEach(() => {
    clearTranslations();
    $localize.locale = originalLocale;
    vi.unstubAllGlobals();
  });

  it('preserves selectable values, labels and their order', () => {
    expect(DEFAULT_LOCALE).toBe(contract.defaultLocale);
    expect(LANGUAGES).toEqual(contract.languages);
    expect(ANGULAR_MJS_LOCALE_MAP).toEqual(contract.mjs);
  });
  it.each(contract.cases)('preserves the complete $input startup contract', async (expected) => {
    stored = expected.input;
    expect(resolveLocale(stored)).toBe(expected.resolved);
    expect(mapLocale(stored)).toBe(expected.mapped);
    expect(getLocale()).toBe(expected.resolved);
    await whenTranslationsReady();
    if (expected.translation === null) {
      expect(fetch).not.toHaveBeenCalled();
    } else {
      expect(fetch).toHaveBeenCalledExactlyOnceWith(expected.translation);
      const angular = expected.angular!;
      expect(getLocaleId(angular.locale)).toBe(angular.data);
      expect(getLocaleId(expected.mapped)).toBe(angular.data);
      const extra =
        angular.extra === 'extra/zh-Hans' ? zhHansExtra : angular.extra === 'extra/zh-Hant' ? zhHantExtra : undefined;
      if (extra) {
        expect(getLocaleExtraDayPeriods(angular.locale, FormStyle.Format, TranslationWidth.Narrow)).toEqual(
          extra[0]![0]
        );
      }
    }
  });
  it.each([null, undefined, '', 'en-us', 'JA-jp', 'unsupported', ' fr ', 'es-CL'])(
    'preserves fallback and case sensitivity for %s',
    async (locale) => {
      stored = locale ?? null;
      expect(resolveLocale(locale)).toBe('en-US');
      expect(mapLocale(locale)).toBe('en');
      expect(getLocale()).toBe('en-US');
      await whenTranslationsReady();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
