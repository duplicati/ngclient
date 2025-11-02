import { inject, Pipe, type PipeTransform } from '@angular/core';
import { DAYJS } from '../providers/dayjs';

@Pipe({
  name: 'durationFormat',
  standalone: true,
})
export class DurationFormatPipe implements PipeTransform {
  #dayjs = inject(DAYJS);

  transform(value: string | undefined | null, forceActualDuration = false, ...args: unknown[]): unknown {
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

    return this.#dayjs.duration({ days, hours, minutes, seconds }).humanize();
  }
}
