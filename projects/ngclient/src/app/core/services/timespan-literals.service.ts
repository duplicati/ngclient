import { Injectable } from '@angular/core';

type Unit = 's' | 'm' | 'h' | 'D' | 'W' | 'M' | 'Y';

@Injectable({
  providedIn: 'root',
})
export class TimespanLiteralsService {
  fromString(str: string | null | undefined) {
    if (!str) return null;

    const res = str.match(/(\d+)([smhDWMY])/);

    return (
      res && {
        value: parseInt(res[1]),
        unit: res[2] as Unit,
      }
    );
  }

  toString(value: number, unit: string) {
    return `${value}${unit}`;
  }
}
