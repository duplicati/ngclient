import { inject, Pipe, type PipeTransform } from '@angular/core';
import { DAYJS } from '../providers/dayjs';

@Pipe({
  name: 'appRelativeTime',
  standalone: true,
})
export class RelativeTimePipe implements PipeTransform {
  #dayjs = inject(DAYJS);

  transform(value: string | number | Date, ...args: unknown[]): unknown {
    this.#dayjs.locale();

    return this.#dayjs(value).fromNow();
  }
}
