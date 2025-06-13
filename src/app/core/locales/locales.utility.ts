import { registerLocaleData } from '@angular/common';
import { loadTranslations } from '@angular/localize';

export const DEFAULT_LOCALE = 'en-US';

// This is the list of supported languages for the UI
// It is used to populate the language selector in the settings
// and to determine which translations to load
export const LANGUAGES = [
  { value: 'en', label: 'English (en-US)' },
  { value: 'en-GB', label: 'English (en-GB)' },
  { value: 'cs', label: 'Czech (cs)' },
  { value: 'da', label: 'Danish (da)' },
  { value: 'de', label: 'German (de)' },
  { value: 'es', label: 'Spanish (es)' },
  { value: 'fi', label: 'Finnish (fi)' },
  { value: 'fr', label: 'French (fr)' },
  { value: 'hu', label: 'Hungarian (hu)' },
  { value: 'it', label: 'Italian (it)' },
  { value: 'ja-JP', label: 'Japanese (ja-JP)' },
  { value: 'nl-NL', label: 'Dutch (nl-NL)' },
  { value: 'pl', label: 'Polish (pl)' },
  { value: 'pt-BR', label: 'Portuguese (pt-BR)' },
  { value: 'pt', label: 'Portuguese (pt)' },
  { value: 'ru', label: 'Russian (ru)' },
  { value: 'sr-RS', label: 'Serbian (sr-RS)' },
  { value: 'sv-SE', label: 'Swedish (sv-SE)' },
  { value: 'zh-CN', label: 'Chinese (zh-CN)' },
  { value: 'zh-Hans', label: 'Chinese (Simplified, zh-Hans)' },
  { value: 'zh-TW', label: 'Chinese (zh-TW)' },
];

// We map various browser-reported locales to our supported locales
const LOCALE_MAP: Record<string, string> = {
  // English variants
  'en': 'en',
  'en-US': 'en',
  'en-GB': 'en-GB',
  'en-AU': 'en',
  'en-CA': 'en',

  // Czech
  'cs': 'cs',
  'cs-CZ': 'cs',

  // Danish
  'da': 'da',
  'da-DK': 'da',

  // German
  'de': 'de',
  'de-DE': 'de',
  'de-AT': 'de',

  // Spanish
  'es': 'es',
  'es-ES': 'es',
  'es-MX': 'es',

  // Finnish
  'fi': 'fi',
  'fi-FI': 'fi',

  // French
  'fr': 'fr',
  'fr-FR': 'fr',
  'fr-CA': 'fr',

  // Hungarian
  'hu': 'hu',
  'hu-HU': 'hu',

  // Italian
  'it': 'it',
  'it-IT': 'it',

  // Japanese
  'ja': 'ja-JP',
  'ja-JP': 'ja-JP',

  // Dutch
  'nl': 'nl-NL',
  'nl-NL': 'nl-NL',
  'nl-BE': 'nl-NL',

  // Polish
  'pl': 'pl',
  'pl-PL': 'pl',

  // Portuguese
  'pt': 'pt',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt',

  // Russian
  'ru': 'ru',
  'ru-RU': 'ru',

  // Serbian
  'sr': 'sr-RS',
  'sr-RS': 'sr-RS',

  // Swedish
  'sv': 'sv-SE',
  'sv-SE': 'sv-SE',
  'sv-FI': 'sv-SE',

  // Chinese
  'zh': 'zh-CN',
  'zh-CN': 'zh-CN',
  'zh-SG': 'zh-CN',
  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-TW',
};

// Angular mjs locales are slightly different from the Transifex locales
export const ANGULAR_MJS_LOCALE_MAP: Record<string, string> = {
  'ja-JP': 'ja',
  'nl-NL': 'nl',
  'sr-RS': 'sr',
  'sv-SE': 'sv',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};

const SUPPORTED_LOCALES = Array.from(new Set(Object.values(LOCALE_MAP)));
type Locales = (typeof SUPPORTED_LOCALES)[number];

export function mapLocale(locale: string | null | undefined) {
  if (!locale) return 'en';

  return (LOCALE_MAP as { [key: string]: string })[locale] ?? 'en';
}

export function getLocale(): Locales {
  const appLang = localStorage.getItem('v1:duplicati:locale') || DEFAULT_LOCALE;
  const locale = SUPPORTED_LOCALES.find((x) => x === appLang) ?? DEFAULT_LOCALE;

  // Try to resolve the mapped locale, falling back to base language
  const mappedLocale = LOCALE_MAP[locale]
    ?? LOCALE_MAP[locale.split('-')[0]] // Map unknown specific locales to base language
    ?? DEFAULT_LOCALE;

  if (locale === DEFAULT_LOCALE) return locale;

  // Angular mjs locales are different from the standard locales
  const mjsLocale = ANGULAR_MJS_LOCALE_MAP[mappedLocale] ?? mappedLocale;
  import(/* @vite-ignore */ `locale/angular/${mjsLocale}.mjs`).then((m) =>
    registerLocaleData(m.default)
  );

  // Until we have a proper translation system, we need to load the message translations manually
  var mappedFileLocale = mappedLocale.replace(/-/g, '_');
  const tempLocale = locale === 'en' ? '' : '.' + mappedFileLocale;

  fetch(`locale/messages${tempLocale}.json`)
    .then((r) => r.json())
    .then((json) => {
      loadTranslations(json.translations);
      ($localize as any).locale = locale;
    });

  return locale;
}
