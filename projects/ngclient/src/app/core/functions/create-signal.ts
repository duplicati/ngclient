import { signal, WritableSignal } from '@angular/core';

export function createSignal<T>(...args: Parameters<typeof signal<T>>): WritableSignal<T> & { value: T } {
  const sig = signal<T>(...args);
  return Object.defineProperty(sig, 'value', {
    get: sig.asReadonly(),
    set: sig.set.bind(sig),
  }) as WritableSignal<T> & { value: T };
}
