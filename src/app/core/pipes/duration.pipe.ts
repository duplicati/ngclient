import { inject, Pipe, type PipeTransform } from '@angular/core';
import { DAYJS } from '../providers/dayjs';

@Pipe({
  name: 'durationFormat',
  standalone: true,
})
export class DurationFormatPipe implements PipeTransform {
  #dayjs = inject(DAYJS);

  transform(value: string | undefined | null, ...args: unknown[]): unknown {
    if (!value) return '';

    const _value = value.split('.')[0];
    const hours = parseInt(_value.split(':')[0]) ?? 0;
    const minutes = parseInt(_value.split(':')[1]) ?? 0;
    const seconds = parseInt(_value.split(':')[2]) ?? 0;

    return this.#dayjs
      .duration({
        hours,
        minutes,
        seconds,
      })
      .humanize();
  }
}
