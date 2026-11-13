import { CreateSignalOptions, inject, WritableSignal } from '@angular/core';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { createSignal } from './create-signal';

export function localStorageSignal<T>(
  key: string,
  initialValue: T,
  persistThroughClear = false,
  options?: CreateSignalOptions<T>
): WritableSignal<T> {
  const ls = inject(LOCALSTORAGE);
  const lsValue = ls.getItemParsed<T>(key, persistThroughClear);

  initialValue = lsValue ?? initialValue;

  const signalFn = createSignal(initialValue, options);
  const set = signalFn.set;

  function setValueToLocalStorage(newValue: T) {
    if (newValue === null || newValue === undefined) {
      ls.removeItem(key);
    } else {
      ls.setItemParsed(key, newValue, persistThroughClear);
    }
  }

  signalFn.set = (newValue: T) => {
    setValueToLocalStorage(newValue);
    set(newValue);
  };

  signalFn.update = (updateFn: (value: T) => T) => {
    const newValue = updateFn(signalFn());
    setValueToLocalStorage(newValue);
    set(newValue);
  };

  return signalFn;
}
