export function getIntlDisplayLocale(locale: string): string {
  // Keep the Serbian Latin script used by the existing date and duration displays.
  return locale === 'sr-RS' ? 'sr-Latn-RS' : locale;
}
