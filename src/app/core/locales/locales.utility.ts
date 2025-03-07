import { registerLocaleData } from '@angular/common';
import { loadTranslations } from '@angular/localize';

export const DEFAULT_LOCALE = 'en-US';
export const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'da-DK'] as const;
export type Locales = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_MAP = {
  'en-US': 'en',
  'en-GB': 'en-GB',
  'da-DK': 'da',
  'de-DE': 'de',
  'fr-FR': 'fr',
};

export const LANGUAGES = [
  {
    value: 'en-US',
    label: 'English (en-US)',
  },
  {
    value: 'en-GB',
    label: 'English (en-GB)',
  },
  {
    value: 'fr-FR',
    label: 'French',
  },
  {
    value: 'de-DE',
    label: 'German',
  },
  {
    value: 'da-DK',
    label: 'Danish',
  },
];

export function mapLocale(locale: string | null | undefined) {
  if (!locale) return 'en';

  return (LOCALE_MAP as { [key: string]: string })[locale] ?? 'en';
}

export function getLocale(): Locales {
  const appLang = localStorage.getItem('v1:duplicati:locale') || DEFAULT_LOCALE;
  const locale = SUPPORTED_LOCALES.find((x) => x === appLang) ?? DEFAULT_LOCALE;
  const mappedLocale = LOCALE_MAP[locale];

  if (locale === DEFAULT_LOCALE) return locale;

  import(/* @vite-ignore */ `/locale/angular/${mappedLocale}.mjs`).then((m) => registerLocaleData(m.default));

  // Until we have a proper translation system, we need to load the message translations manually
  let tempLocale = locale === 'en-GB' ? 'en' : locale;

  fetch(`/locale/messages.${tempLocale}.json`)
    .then((r) => r.json())
    .then((json) => {
      loadTranslations(json.translations);
      ($localize as any).locale = locale;
    });

  return locale;
}
