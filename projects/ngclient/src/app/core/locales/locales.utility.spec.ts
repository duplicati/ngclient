import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTranslations } from '@angular/localize';
import {
  DEFAULT_LOCALE,
  getLocale,
  LANGUAGES,
  mapLocale,
  resolveLocale,
  whenTranslationsReady,
} from './locales.utility';

// Node's built-in experimental localStorage shadows the jsdom global, so we stub our own.
function createLocalStorageStub() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, String(value)),
  };
}

describe('locale utilities', () => {
  let originalLocale: string | undefined;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    originalLocale = $localize.locale;
  });

  afterEach(() => {
    localStorage.clear();
    clearTranslations();
    $localize.locale = originalLocale;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(LANGUAGES.map(({ value }) => [value]))('accepts the selectable locale %s', (locale) => {
    expect(resolveLocale(locale)).toBe(locale);
  });

  it.each([
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-HK'],
    ['ja-JP', 'ja'],
  ])('maps %s to the existing %s translation locale', (locale, mappedLocale) => {
    expect(mapLocale(locale)).toBe(mappedLocale);
  });

  it.each([null, undefined, '', 'unsupported-locale'])('falls back to the default locale for %s', (locale) => {
    expect(resolveLocale(locale)).toBe(DEFAULT_LOCALE);
  });

  it('loads the Simplified Chinese translations for a saved zh-CN selection', async () => {
    const json = vi.fn().mockResolvedValue({ translations: {} });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('v1:duplicati:locale', 'zh-CN');

    expect(getLocale()).toBe('zh-CN');
    expect(fetchMock).toHaveBeenCalledWith('locale/messages.zh.json');

    await whenTranslationsReady();
    expect(json).toHaveBeenCalled();
  });

  it('keeps startup pending until the translation body has been applied', async () => {
    let resolveBody!: (body: { translations: Record<string, string> }) => void;
    const json = vi.fn(() => new Promise((resolve) => (resolveBody = resolve)));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json }));
    localStorage.setItem('v1:duplicati:locale', 'zh-Hant');

    expect(getLocale()).toBe('zh-Hant');
    let ready = false;
    const completion = whenTranslationsReady().then(() => (ready = true));
    await vi.waitFor(() => expect(json).toHaveBeenCalled());
    expect(ready).toBe(false);

    const translations = { 'locale-readiness-test': 'Translated greeting' };
    resolveBody({ translations });
    await completion;
    expect($localize`:@@locale-readiness-test:Startup greeting`).toBe('Translated greeting');
    expect($localize.locale).toBe('zh-Hant');
    expect(ready).toBe(true);
  });

  it.each([null, 'en-US', 'unsupported-locale'])('does not fetch translations for %s', async (locale) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    if (locale) localStorage.setItem('v1:duplicati:locale', locale);

    expect(getLocale()).toBe(DEFAULT_LOCALE);
    await whenTranslationsReady();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['network', 'http', 'json'])('allows startup after a translation %s failure', async (failure) => {
    const json = vi.fn().mockRejectedValue(new Error('Invalid JSON'));
    const fetchMock =
      failure === 'network'
        ? vi.fn().mockRejectedValue(new Error('Network error'))
        : vi.fn().mockResolvedValue({ ok: failure !== 'http', status: 404, json });
    vi.stubGlobal('fetch', fetchMock);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('v1:duplicati:locale', 'zh-Hant');

    getLocale();
    await expect(whenTranslationsReady()).resolves.toBeUndefined();
    expect($localize.locale).toBe(originalLocale);
    expect(warning).toHaveBeenCalledTimes(1);
    if (failure === 'http') expect(json).not.toHaveBeenCalled();
  });
});
