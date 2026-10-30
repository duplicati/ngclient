/** Build-time source of truth. Run bun run gen:locales after editing. */
export type LocaleDefinition = {
  code: string;
  label?: string;
  aliases?: readonly string[];
  /** Existing runtime translation target; defaults to code. */
  runtime?: string;
  /** The source language has no separate localized build. */
  build?: false;
  /** JSON/XLF stem; defaults to code with hyphens changed to underscores. */
  file?: string;
  /** XLF-only override, e.g. en-US builds from messages.en.xlf. */
  buildFile?: string;
  /** Static module, optional registration alias and supplemental data module. */
  angular?: { data: string; alias?: string; extra?: string };
  /** Static module; key defaults to lowercase code, asset=false omits the raw JS copy. */
  dayjs?: { data: string; key?: string; asset?: false };
};

export const DEFAULT_LOCALE = 'en-US';
export const SOURCE_LOCALE = { code: 'en', baseHref: DEFAULT_LOCALE };

// Aliases, regional data and asset membership preserve the existing behavior.
export const LOCALE_CATALOG: readonly LocaleDefinition[] = [
  {
    code: 'en',
    label: 'English (en-US)',
    aliases: ['en-AU', 'en-CA'],
    build: false,
    angular: {
      data: 'en',
    },
  },
  {
    code: 'en-GB',
    label: 'English (en-GB)',
    angular: {
      data: 'en-GB',
    },
    dayjs: {
      data: 'en-gb',
    },
  },
  {
    code: 'cs',
    label: 'Czech (cs)',
    aliases: ['cs-CZ'],
    angular: {
      data: 'cs',
    },
    dayjs: {
      data: 'cs',
    },
  },
  {
    code: 'da',
    label: 'Danish (da)',
    aliases: ['da-DK'],
    angular: {
      data: 'da',
    },
    dayjs: {
      data: 'da',
    },
  },
  {
    code: 'de',
    label: 'German (de)',
    aliases: ['de-AT'],
    angular: {
      data: 'de',
    },
    dayjs: {
      data: 'de',
    },
  },
  {
    code: 'es',
    label: 'Spanish (es)',
    aliases: ['es-ES', 'es-MX'],
    angular: {
      data: 'es',
    },
    dayjs: {
      data: 'es',
    },
  },
  {
    code: 'fi',
    label: 'Finnish (fi)',
    aliases: ['fi-FI'],
    angular: {
      data: 'fi',
    },
    dayjs: {
      data: 'fi',
    },
  },
  {
    code: 'fr',
    label: 'French (fr)',
    angular: {
      data: 'fr',
    },
    dayjs: {
      data: 'fr',
    },
  },
  {
    code: 'hu',
    label: 'Hungarian (hu)',
    aliases: ['hu-HU'],
    angular: {
      data: 'hu',
    },
    dayjs: {
      data: 'hu',
    },
  },
  {
    code: 'it',
    label: 'Italian (it)',
    angular: {
      data: 'it',
    },
    dayjs: {
      data: 'it',
    },
  },
  {
    code: 'ja-JP',
    label: 'Japanese (ja-JP)',
    runtime: 'ja',
    angular: {
      data: 'ja',
      alias: 'ja',
    },
  },
  {
    code: 'ko',
    label: 'Korean (ko)',
    aliases: ['ko-KR'],
    angular: {
      data: 'ko',
    },
    dayjs: {
      data: 'ko',
    },
  },
  {
    code: 'nl-NL',
    label: 'Dutch (nl-NL)',
    aliases: ['nl'],
    angular: {
      data: 'nl',
      alias: 'nl',
    },
    dayjs: {
      data: 'nl',
      key: 'nl',
    },
  },
  {
    code: 'pl',
    label: 'Polish (pl)',
    aliases: ['pl-PL'],
    angular: {
      data: 'pl',
    },
    dayjs: {
      data: 'pl',
    },
  },
  {
    code: 'pt-BR',
    label: 'Portuguese (pt-BR)',
    angular: {
      data: 'pt',
    },
  },
  {
    code: 'pt',
    label: 'Portuguese (pt)',
    aliases: ['pt-PT'],
    angular: {
      data: 'pt',
    },
    dayjs: {
      data: 'pt',
    },
  },
  {
    code: 'ru',
    label: 'Russian (ru)',
    aliases: ['ru-RU'],
    angular: {
      data: 'ru',
    },
    dayjs: {
      data: 'ru',
    },
  },
  {
    code: 'sr-RS',
    label: 'Serbian (sr-RS)',
    aliases: ['sr'],
    angular: {
      data: 'sr',
      alias: 'sr',
    },
    dayjs: {
      data: 'sr',
      key: 'sr',
    },
  },
  {
    code: 'sv-SE',
    label: 'Swedish (sv-SE)',
    aliases: ['sv', 'sv-FI'],
    angular: {
      data: 'sv',
      alias: 'sv',
    },
    dayjs: {
      data: 'sv',
      key: 'sv',
    },
  },
  {
    code: 'tr',
    label: 'Turkish (tr)',
    aliases: ['tr-TR'],
    angular: {
      data: 'tr',
    },
    dayjs: {
      data: 'tr',
    },
  },
  {
    code: 'zh-CN',
    label: 'Chinese (zh-CN)',
    runtime: 'zh',
    angular: {
      data: 'zh-Hans',
      alias: 'zh-Hans',
      extra: 'zh-Hans',
    },
  },
  {
    code: 'zh-TW',
    label: 'Chinese (zh-TW)',
    angular: {
      data: 'zh-Hant',
      alias: 'zh-Hant',
      extra: 'zh-Hant',
    },
    dayjs: {
      data: 'zh-tw',
    },
  },
  {
    code: 'de-CH',
    label: 'German (de-CH)',
    angular: {
      data: 'de-CH',
    },
    dayjs: {
      data: 'de-ch',
      asset: false,
    },
  },
  {
    code: 'de-DE',
    label: 'German (de-DE)',
    angular: {
      data: 'de',
    },
    dayjs: {
      data: 'de',
    },
  },
  {
    code: 'es-AR',
    label: 'Spanish (es-AR)',
    angular: {
      data: 'es',
    },
    dayjs: {
      data: 'es',
    },
  },
  {
    code: 'fr-CA',
    label: 'French (fr-CA)',
    angular: {
      data: 'fr-CA',
    },
    dayjs: {
      data: 'fr-ca',
      asset: false,
    },
  },
  {
    code: 'fr-FR',
    label: 'French (fr-FR)',
    angular: {
      data: 'fr',
    },
    dayjs: {
      data: 'fr',
    },
  },
  {
    code: 'it-IT',
    label: 'Italian (it-IT)',
    angular: {
      data: 'it',
    },
    dayjs: {
      data: 'it',
    },
  },
  {
    code: 'ja',
    label: 'Japanese (ja)',
    angular: {
      data: 'ja',
    },
    dayjs: {
      data: 'ja',
    },
  },
  {
    code: 'nl-BE',
    label: 'Dutch (nl-BE)',
    angular: {
      data: 'nl-BE',
    },
    dayjs: {
      data: 'nl-be',
      asset: false,
    },
  },
  {
    code: 'zh-Hant',
    label: 'Chinese (zh-Hant)',
    file: 'zh-Hant',
    angular: {
      data: 'zh-Hant',
      extra: 'zh-Hant',
    },
    dayjs: {
      data: 'zh-tw',
    },
  },
  {
    code: 'zh',
    label: 'Chinese (zh)',
    aliases: ['zh-SG'],
    angular: {
      data: 'zh-Hans',
    },
    dayjs: {
      data: 'zh-cn',
    },
  },
  {
    code: 'zh-HK',
    label: 'Chinese (zh-HK)',
    angular: {
      data: 'zh-Hant',
      alias: 'zh-Hant',
      extra: 'zh-Hant',
    },
    dayjs: {
      data: 'zh-hk',
      asset: false,
    },
  },
  {
    code: 'en-US',
    runtime: 'en',
    buildFile: 'en',
    dayjs: {
      data: 'en',
    },
  },
  {
    code: 'zh-Hans',
    runtime: 'zh',
    file: 'zh-Hans',
    angular: {
      data: 'zh-Hans',
      extra: 'zh-Hans',
    },
  },
];
