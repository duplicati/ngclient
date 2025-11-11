import { isSignal } from '@angular/core';

type Signal<T> = {
  (): T;
};

export type UnwrapSignals<T> =
  T extends Signal<infer V>
    ? V
    : T extends (infer U)[]
      ? UnwrapSignals<U>[]
      : T extends object
        ? { [K in keyof T]: UnwrapSignals<T[K]> }
        : T;

export function parseRecursiveObjectOfSignals<T>(entry: T): UnwrapSignals<T> {
  if (isSignal(entry)) {
    return entry() as UnwrapSignals<T>;
  }

  if (Array.isArray(entry)) {
    return entry.map((item) => parseRecursiveObjectOfSignals(item)) as UnwrapSignals<T>;
  }

  if (typeof entry === 'object' && entry !== null) {
    const result: any = {};

    for (const key in entry) {
      if (entry.hasOwnProperty(key)) {
        result[key] = parseRecursiveObjectOfSignals(entry[key]);
      }
    }

    return result as UnwrapSignals<T>;
  }

  return entry as UnwrapSignals<T>;
}
