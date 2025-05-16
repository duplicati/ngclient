import { DatePipe } from '@angular/common';
import { inject, Pipe, type PipeTransform } from '@angular/core';
import { DAYJS } from '../providers/dayjs';

@Pipe({
  name: 'relativeTime',
  standalone: true,
})
export class RelativeTimePipe implements PipeTransform {
  #dayjs = inject(DAYJS);
  #datePipe = inject(DatePipe);

  // Convert Basic ISO 8601 timestamp to Extended ISO 8601 format that Day.js can parse
  private convertTimestamp(input: string): string {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(input);
    if (match) {
      const [_, year, month, day, hour, minute, second] = match;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    }
    return input;
  }

  transform(value: string | number | Date | undefined | null, forceActualDate = false, ...args: unknown[]): unknown {
    if (!value) return 'N/A';

    if (forceActualDate) {
      return this.#datePipe.transform(value, 'short');
    }

    this.#dayjs.locale();
    if (typeof value === 'string') {
      value = this.convertTimestamp(value);
    }

    return this.#dayjs(value).fromNow();
  }
}
