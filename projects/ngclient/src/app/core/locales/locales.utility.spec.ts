import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCALE, getLocale, LANGUAGES, mapLocale, resolveLocale } from './locales.utility';

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
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
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
    const fetchMock = vi.fn().mockResolvedValue({ json });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('v1:duplicati:locale', 'zh-CN');

    expect(getLocale()).toBe('zh-CN');
    expect(fetchMock).toHaveBeenCalledWith('locale/messages.zh.json');

    await vi.waitFor(() => expect(json).toHaveBeenCalled());
  });
});
