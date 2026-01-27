// @ts-nocheck
import locale_cs from 'dayjs/esm/locale/cs';
import locale_da from 'dayjs/esm/locale/da';
import locale_de from 'dayjs/esm/locale/de';
import locale_de_ch from 'dayjs/esm/locale/de-ch';
import locale_en from 'dayjs/esm/locale/en';
import locale_en_gb from 'dayjs/esm/locale/en-gb';
import locale_es from 'dayjs/esm/locale/es';
import locale_fi from 'dayjs/esm/locale/fi';
import locale_fr from 'dayjs/esm/locale/fr';
import locale_fr_ca from 'dayjs/esm/locale/fr-ca';
import locale_hu from 'dayjs/esm/locale/hu';
import locale_it from 'dayjs/esm/locale/it';
import locale_ja from 'dayjs/esm/locale/ja';
import locale_nl from 'dayjs/esm/locale/nl';
import locale_nl_be from 'dayjs/esm/locale/nl-be';
import locale_pl from 'dayjs/esm/locale/pl';
import locale_pt from 'dayjs/esm/locale/pt';
import locale_ru from 'dayjs/esm/locale/ru';
import locale_sr from 'dayjs/esm/locale/sr';
import locale_sv from 'dayjs/esm/locale/sv';
import locale_zh_cn from 'dayjs/esm/locale/zh-cn';
import locale_zh_hk from 'dayjs/esm/locale/zh-hk';
import locale_zh_tw from 'dayjs/esm/locale/zh-tw';

// Lowercase locale names for simpler lookup
export const DAYJS_LOCALES = {
  'en-us': locale_en,
  'en-gb': locale_en_gb,
  cs: locale_cs,
  da: locale_da,
  de: locale_de,
  es: locale_es,
  fi: locale_fi,
  fr: locale_fr,
  hu: locale_hu,
  it: locale_it,
  ja: locale_ja,
  nl: locale_nl,
  pl: locale_pl,
  pt: locale_pt,
  ru: locale_ru,
  sr: locale_sr,
  sv: locale_sv,
  zh: locale_zh_cn,
  'zh-tw': locale_zh_tw,
  'de-ch': locale_de_ch,
  'de-de': locale_de,
  'es-ar': locale_es,
  'fr-ca': locale_fr_ca,
  'fr-fr': locale_fr,
  'it-it': locale_it,
  'nl-be': locale_nl_be,
  'zh-hant': locale_zh_tw,
  'zh-hk': locale_zh_hk,
} as { [key: string]: ILocale };
