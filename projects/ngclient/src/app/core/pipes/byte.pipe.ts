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

  /**
   * @param compact Show at most three significant digits, such as 176 MB or 7.16 GB, for narrow places
   */
  transform(
    bytes: number | string | undefined | null,
    longForm: boolean = false,
    allowZero: boolean = false,
    compact: boolean = false
  ): string {
    if (allowZero && bytes === 0) return longForm ? '0 Bytes' : '0B';
    if (!bytes || bytes === 0) return '';

    if (typeof bytes === 'string') {
      bytes = parseInt(bytes);
    }

    if (isNaN(bytes)) {
      return '';
    }

    const isMac = this.#isMac();
    const units = isMac
      ? ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
      : ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

    let power = Math.floor(Math.log(bytes) / Math.log(isMac ? 1000 : 1024));
    power = Math.min(power, units.length - 1);

    const size = bytes / Math.pow(isMac ? 1000 : 1024, power);
    const digits = !compact ? '1.0-2' : size >= 100 ? '1.0-0' : size >= 10 ? '1.0-1' : '1.0-2';
    const formattedSize = this.decimalPipe.transform(size, digits);
    if (!formattedSize) return '';

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
