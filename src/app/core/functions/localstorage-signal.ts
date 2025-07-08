import { CreateSignalOptions, inject, WritableSignal } from '@angular/core';
import { SIGNAL, SignalGetter, signalSetFn } from '@angular/core/primitives/signals';
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

  const signalFn = createSignal(initialValue) as SignalGetter<T> & WritableSignal<T>;
  const node = signalFn[SIGNAL];

  if (options?.equal) {
    node.equal = options.equal;
  }

  function setValueToLocalStorage(newValue: T) {
    if (newValue === null || newValue === undefined) {
      ls.removeItem(key);
    } else {
      ls.setItemParsed(key, newValue, persistThroughClear);
    }
  }

  signalFn.set = (newValue: T) => {
    setValueToLocalStorage(newValue);
    signalSetFn(node, newValue);
  };

  signalFn.update = (updateFn: (value: T) => T) => {
    const newValue = updateFn(signalFn());
    setValueToLocalStorage(newValue);
    signalSetFn(node, newValue);
  };

  return signalFn;
}
