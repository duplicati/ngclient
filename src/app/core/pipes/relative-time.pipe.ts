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

  transform(value: string | number | Date | undefined | null, forceActualDate = false, ...args: unknown[]): unknown {
    if (!value) return '';

    if (forceActualDate) {
      return this.#datePipe.transform(value, 'short');
    }

    this.#dayjs.locale();

    return this.#dayjs(value).fromNow();
  }
}
