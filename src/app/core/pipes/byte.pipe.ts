import { DecimalPipe } from '@angular/common';
import { inject, Pipe, type PipeTransform } from '@angular/core';

type UserAgentData = {
  platform: string;
  mobile: boolean;
  brands: {
    brand: string;
    version: string;
  }[];
};

@Pipe({
  name: 'bytes',
  standalone: true,
})
export class BytesPipe implements PipeTransform {
  decimalPipe = inject(DecimalPipe);

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
    const formattedSize = this.decimalPipe.transform(size, '1.0-2');

    return `${formattedSize} ${longForm ? units[power] : units[power].replace('Bytes', 'B')}`;
  }

  #isMac() {
    // Only works in chromium browsers
    if (((navigator as any).userAgentData as UserAgentData)?.platform.toLowerCase().includes('mac')) return true;

    const strings = ['mac', 'macintosh', 'os x', 'apple'];
    const validationString = ((navigator.userAgent || navigator.platform || navigator.vendor) ?? '').toLowerCase();

    if (!validationString) return false;

    return strings.some((string) => validationString.includes(string));
  }
}
