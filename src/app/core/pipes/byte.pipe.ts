import { Pipe, type PipeTransform } from '@angular/core';

@Pipe({
  name: 'bytes',
  standalone: true,
})
export class BytesPipe implements PipeTransform {
  transform(bytes: number | string | undefined | null, longForm: boolean = false): string {
    if (!bytes || bytes === 0) return '0 Bytes';

    if (typeof bytes === 'string') {
      bytes = parseInt(bytes);
    }

    if (isNaN(bytes)) {
      return '0 Bytes';
    }

    const isMac = this.#isMac();
    const units = isMac
      ? ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
      : ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

    let power = Math.floor(Math.log(bytes) / Math.log(isMac ? 1000 : 1024));
    power = Math.min(power, units.length - 1);

    const size = bytes / Math.pow(isMac ? 1000 : 1024, power);
    const formattedSize = Math.round(size * 100) / 100; // Keep up to 2 decimals

    return `${formattedSize} ${longForm ? units[power] : units[power].replace('Bytes', 'B')}`;
  }

  #isMac() {
    const strings = ['mac', 'macintosh', 'os x'];
    const validationString = ((navigator.platform || navigator.userAgent) ?? '').toLowerCase();

    if (!validationString) return false;

    return strings.some((string) => validationString.includes(string));
  }
}
