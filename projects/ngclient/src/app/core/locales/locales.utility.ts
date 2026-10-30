import { registerLocaleData } from '@angular/common';
import { loadTranslations } from '@angular/localize';

import { ANGULAR_LOCALE_DATA, ANGULAR_LOCALE_EXTRA_DATA } from './angular-locale-data';
import { ANGULAR_MJS_LOCALE_MAP, DEFAULT_LOCALE, LOCALE_MAP } from './locale-definitions';
export { ANGULAR_MJS_LOCALE_MAP, DEFAULT_LOCALE, LANGUAGES } from './locale-definitions';

const SUPPORTED_LOCALES = new Set(Object.keys(LOCALE_MAP));
type Locales = string;

let translationsReady: Promise<void> = Promise.resolve();

export const whenTranslationsReady = () => translationsReady;

export function resolveLocale(locale: string | null | undefined): Locales {
  const requestedLocale = locale || DEFAULT_LOCALE;
  return SUPPORTED_LOCALES.has(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
}

export function mapLocale(locale: string | null | undefined) {
  if (!locale) return 'en';

  return LOCALE_MAP[locale] ?? 'en';
}

export function getLocale(): Locales {
  const appLang = localStorage.getItem('v1:duplicati:locale') || DEFAULT_LOCALE;
  const locale = resolveLocale(appLang);

  // Try to resolve the mapped locale, falling back to base language
  const mappedLocale =
    LOCALE_MAP[locale] ??
    LOCALE_MAP[locale.split('-')[0]] ?? // Map unknown specific locales to base language
    DEFAULT_LOCALE;

  if (locale === DEFAULT_LOCALE) {
    translationsReady = Promise.resolve();
    return locale;
  }

  // Angular mjs locales are different from the standard locales
  const mjsLocale = ANGULAR_MJS_LOCALE_MAP[mappedLocale] ?? mappedLocale;
  const localeData = ANGULAR_LOCALE_DATA[mjsLocale];
  const extraLocaleData = ANGULAR_LOCALE_EXTRA_DATA[mjsLocale];
  if (localeData) {
    registerLocaleData(localeData, mjsLocale, extraLocaleData);
    // Register under the mapped locale as well, if different from mjs locale
    if (mjsLocale !== mappedLocale) registerLocaleData(localeData, mappedLocale, extraLocaleData);
  }

  // We need to load the message translations manually, as Angular only supports static translations
  const mappedFileLocale = mappedLocale == 'zh-Hant' ? 'zh-Hant' : mappedLocale.replace(/-/g, '_');
  const tempLocale = locale === 'en' ? '' : '.' + mappedFileLocale;

  translationsReady = fetch(`locale/messages${tempLocale}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Translation request failed: ${r.status}`);
      return r.json();
    })
    .then((json) => {
      loadTranslations(json.translations);
      ($localize as any).locale = locale;
    })
    .catch((error) => {
      console.warn('Failed to load translations; using English messages.', error);
    });

  return locale;
}
