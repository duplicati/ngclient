import { registerLocaleData } from '@angular/common';
import { loadTranslations } from '@angular/localize';

// Locale data imports (manually curated for LANGUAGES list)
import localeCs from '@angular/common/locales/cs';
import localeDa from '@angular/common/locales/da';
import localeDe from '@angular/common/locales/de';
import localeDeCh from '@angular/common/locales/de-CH';
import localeEn from '@angular/common/locales/en';
import localeEnGb from '@angular/common/locales/en-GB';
import localeEs from '@angular/common/locales/es';
import localeZhHansExtra from '@angular/common/locales/extra/zh-Hans';
import localeZhHantExtra from '@angular/common/locales/extra/zh-Hant';
import localeFi from '@angular/common/locales/fi';
import localeFr from '@angular/common/locales/fr';
import localeFrCa from '@angular/common/locales/fr-CA';
import localeHu from '@angular/common/locales/hu';
import localeIt from '@angular/common/locales/it';
import localeJa from '@angular/common/locales/ja';
import localeNl from '@angular/common/locales/nl';
import localeNlBe from '@angular/common/locales/nl-BE';
import localePl from '@angular/common/locales/pl';
import localePt from '@angular/common/locales/pt';
import localeRu from '@angular/common/locales/ru';
import localeSr from '@angular/common/locales/sr';
import localeSv from '@angular/common/locales/sv';
import localeZhHans from '@angular/common/locales/zh-Hans';
import localeZhHant from '@angular/common/locales/zh-Hant';
import localeZhHantHk from '@angular/common/locales/zh-Hant-HK';

// Mapping locale codes to their imported Angular locale data
const ANGULAR_LOCALE_DATA: Record<string, any> = {
  en: localeEn,
  'en-GB': localeEnGb,
  nl: localeNl,
  fr: localeFr,
  de: localeDe,
  cs: localeCs,
  da: localeDa,
  es: localeEs,
  fi: localeFi,
  hu: localeHu,
  it: localeIt,
  ja: localeJa,
  pl: localePl,
  pt: localePt,
  'pt-BR': localePt,
  ru: localeRu,
  sr: localeSr,
  sv: localeSv,
  'zh-CN': localeZhHans,
  'zh-TW': localeZhHant,
  'zh-Hans': localeZhHans,
  'zh-Hant': localeZhHant,
  'de-CH': localeDeCh,
  'fr-CA': localeFrCa,
  'nl-BE': localeNlBe,
  'zh-HK': localeZhHantHk,
  'de-DE': localeDe,
  'fr-FR': localeFr,
  'it-IT': localeIt,
  'es-AR': localeEs,
  zh: localeZhHans,
};

const ANGULAR_LOCALE_EXTRA_DATA: Record<string, any> = {
  'zh-Hans': localeZhHansExtra,
  'zh-Hant': localeZhHantExtra,
};

export const DEFAULT_LOCALE = 'en-US';

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
  { value: 'zh-TW', label: 'Chinese (zh-TW)' },
  { value: 'de-CH', label: 'German (de-CH)' },
  { value: 'de-DE', label: 'German (de-DE)' },
  { value: 'es-AR', label: 'Spanish (es-AR)' },
  { value: 'fr-CA', label: 'French (fr-CA)' },
  { value: 'fr-FR', label: 'French (fr-FR)' },
  { value: 'it-IT', label: 'Italian (it-IT)' },
  { value: 'ja', label: 'Japanese (ja)' },
  { value: 'nl-BE', label: 'Dutch (nl-BE)' },
  { value: 'zh-Hant', label: 'Chinese (zh-Hant)' },
  { value: 'zh', label: 'Chinese (zh)' },
  { value: 'zh-HK', label: 'Chinese (zh-HK)' },
];

// We map various browser-reported locales to our supported locales
const LOCALE_MAP: Record<string, string> = {
  // English variants
  en: 'en',
  'en-US': 'en',
  'en-GB': 'en-GB',
  'en-AU': 'en',
  'en-CA': 'en',

  // Czech
  cs: 'cs',
  'cs-CZ': 'cs',

  // Danish
  da: 'da',
  'da-DK': 'da',

  // German
  de: 'de',
  'de-DE': 'de-DE',
  'de-AT': 'de',
  'de-CH': 'de-CH',

  // Spanish
  es: 'es',
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es-AR',

  // Finnish
  fi: 'fi',
  'fi-FI': 'fi',

  // French
  fr: 'fr',
  'fr-FR': 'fr-FR',
  'fr-CA': 'fr-CA',

  // Hungarian
  hu: 'hu',
  'hu-HU': 'hu',

  // Italian
  it: 'it',
  'it-IT': 'it-IT',

  // Japanese
  ja: 'ja',
  'ja-JP': 'ja',

  // Dutch
  nl: 'nl-NL',
  'nl-NL': 'nl-NL',
  'nl-BE': 'nl-BE',

  // Polish
  pl: 'pl',
  'pl-PL': 'pl',

  // Portuguese
  pt: 'pt',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt',

  // Russian
  ru: 'ru',
  'ru-RU': 'ru',

  // Serbian
  sr: 'sr-RS',
  'sr-RS': 'sr-RS',

  // Swedish
  sv: 'sv-SE',
  'sv-SE': 'sv-SE',
  'sv-FI': 'sv-SE',

  // Chinese
  zh: 'zh',
  'zh-CN': 'zh',
  'zh-SG': 'zh',
  'zh-TW': 'zh-TW',
  'zh-HK': 'zh-HK',
  'zh-Hans': 'zh',
  'zh-Hant': 'zh-Hant',
};

export const ANGULAR_MJS_LOCALE_MAP: Record<string, string> = {
  'ja-JP': 'ja',
  'nl-NL': 'nl',
  'sr-RS': 'sr',
  'sv-SE': 'sv',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-HK': 'zh-Hant',
};

const SUPPORTED_LOCALES = Array.from(new Set(Object.values(LOCALE_MAP)));
type Locales = (typeof SUPPORTED_LOCALES)[number];

export function mapLocale(locale: string | null | undefined) {
  if (!locale) return 'en';

  return LOCALE_MAP[locale] ?? 'en';
}

export function getLocale(): Locales {
  const appLang = localStorage.getItem('v1:duplicati:locale') || DEFAULT_LOCALE;
  const locale = SUPPORTED_LOCALES.find((x) => x === appLang) ?? DEFAULT_LOCALE;

  // Try to resolve the mapped locale, falling back to base language
  const mappedLocale =
    LOCALE_MAP[locale] ??
    LOCALE_MAP[locale.split('-')[0]] ?? // Map unknown specific locales to base language
    DEFAULT_LOCALE;

  if (locale === DEFAULT_LOCALE) return locale;

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

  fetch(`locale/messages${tempLocale}.json`)
    .then((r) => r.json())
    .then((json) => {
      loadTranslations(json.translations);
      ($localize as any).locale = locale;
    });

  return locale;
}
