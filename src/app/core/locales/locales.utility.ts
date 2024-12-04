import { registerLocaleData } from '@angular/common';
import { loadTranslations } from '@angular/localize';
import { $localize } from '@angular/localize/init';

export const DEFAULT_LOCALE = 'en-US';
export const SUPPORTED_LOCALES = ['en-US', 'de-DE', 'fr-FR', 'da-DK'] as const;
export type Locales = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_MAP = {
  'en-US': 'en',
  'da-DK': 'da',
  'de-DE': 'de',
  'fr-FR': 'fr',
};

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
  fetch(`/locale/messages.${locale}.json`)
    .then((r) => r.json())
    .then((json) => {
      loadTranslations(json.translations);
      $localize.locale = locale;
    });

  return locale;
}
