import { registerLocaleData } from '@angular/common';
import { ApplicationConfig, LOCALE_ID, mergeApplicationConfig } from '@angular/core';
import { loadTranslations } from '@angular/localize';
import { $localize } from '@angular/localize/init';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// en === en-US
// en-GB === en-GB
const SUPPORTED_LOCALES = ['en-US', 'de-DE', 'fr-FR'] as const;
type Locales = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: Locales = 'en-US';
const appLang = localStorage.getItem('locale') || DEFAULT_LOCALE;
const selectedLocale = SUPPORTED_LOCALES.find((x) => x === appLang) ?? DEFAULT_LOCALE;

// if (SUPPORTED_LOCALES.includes(appLang as Locales)) {
//   localStorage.removeItem('locale');
// }

// Init provided language
initLanguage(selectedLocale)
  .then((selectedLocale) => {
    const localeConfig: ApplicationConfig = {
      providers: [{ provide: LOCALE_ID, useValue: selectedLocale }],
    };

    const config = mergeApplicationConfig(appConfig, localeConfig);

    return bootstrapApplication(AppComponent, config);
  })
  .catch((err) => console.error(err));

async function initLanguage(locale: Locales): Promise<Locales> {
  if (locale === DEFAULT_LOCALE) return DEFAULT_LOCALE;

  const localePath = `/locale/messages.${locale}.json`;
  const json = await fetch(localePath)
    .then((r) => {
      if (r.status === 404) {
        throw new Error(`Translation file not found for (locale: ${locale})`);
      }

      return r.json();
    })
    .catch((err) => {
      console.error('Error loading translation file', err);
      return;
    });

  if (!json) return DEFAULT_LOCALE;

  // Initialize translation
  loadTranslations(json.translations);
  $localize.locale = locale;

  // Load required locale module (needs to be adjusted for different locales)
  let localeModule = undefined;

  if (locale === 'de-DE') {
    localeModule = await import(`../node_modules/@angular/common/locales/de`);
  }

  if (locale === 'fr-FR') {
    localeModule = await import(`../node_modules/@angular/common/locales/fr`);
  }

  if (!localeModule) {
    console.error(`Locale module not found for (locale: ${locale})`);
    return locale;
  }

  // const localeModule = await import(`../node_modules/@angular/common/locales/de`);
  registerLocaleData(localeModule.default);

  return locale;
}
