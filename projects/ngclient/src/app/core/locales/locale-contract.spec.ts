import { FactoryProvider } from '@angular/core';
import { getLocaleId, getLocaleExtraDayPeriods, FormStyle, TranslationWidth } from '@angular/common';
import zhHansExtra from '@angular/common/locales/extra/zh-Hans';
import zhHantExtra from '@angular/common/locales/extra/zh-Hant';
import { clearTranslations } from '@angular/localize';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DayJsProvider } from '../providers/dayjs';
import { DAYJS_LOCALES } from './dayjs.const';
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
  it('preserves all Day.js registry keys and locale modules', () => {
    expect(Object.fromEntries(Object.entries(DAYJS_LOCALES).map(([key, data]) => [key, data.name]))).toEqual(
      contract.dayjs
    );
  });
  it.each([...contract.cases.map((c) => c.input), ' FR-ca ', 'pt-PT', 'xx-YY', ''])(
    'preserves Day.js regional lookup and fallback for %s',
    (input) => {
      stored = input;
      const normalized = input.toLowerCase().trim();
      const keys = contract.dayjs as Record<string, string>;
      const expected = keys[normalized] ?? keys[normalized.split('-')[0]] ?? keys['en-us'];
      const dayjs = (DayJsProvider as FactoryProvider).useFactory();
      expect(dayjs.locale()).toBe(expected);
      dayjs.locale('en');
    }
  );
});
