import { inject, LOCALE_ID, Pipe, type PipeTransform } from '@angular/core';
import { getIntlDisplayLocale } from '../locales/intl-display-locale';
import { relativeTimeMagnitude } from './relative-time-magnitude';

@Pipe({
  name: 'durationFormat',
  standalone: true,
})
export class DurationFormatPipe implements PipeTransform {
  #locale = getIntlDisplayLocale(inject(LOCALE_ID));

  transform(value: string | undefined | null, forceActualDuration = false, ...args: unknown[]): string {
    if (!value) return '';

    // Match: [days.]HH:MM:SS[.fraction]
    const m = /^\s*(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?\s*$/.exec(value);
    if (!m) return '';

    const days = parseInt(m[1] ?? '0', 10);
    const hours = parseInt(m[2], 10);
    const minutes = parseInt(m[3], 10);
    const seconds = parseInt(m[4], 10);

    if (forceActualDuration) {
      return `${days ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;
    }

    const now = new Date();
    const end = new Date(now.getTime() + (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
    if (Number.isNaN(end.getTime())) return '';
    const [amount, unit] = relativeTimeMagnitude(end, now);
    return new Intl.NumberFormat(this.#locale, { style: 'unit', unit, unitDisplay: 'long' }).format(amount);
  }
}
