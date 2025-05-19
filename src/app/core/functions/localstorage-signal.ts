import { CreateSignalOptions, WritableSignal } from '@angular/core';
import { SIGNAL, SignalGetter, signalSetFn } from '@angular/core/primitives/signals';
import { createSignal } from './create-signal';

export function localStorageSignal<T>(
  initialValue: T,
  key: string,
  options?: CreateSignalOptions<T>
): WritableSignal<T> {
  const lsValue = localStorage.getItem(key);

  if (lsValue !== null && lsValue !== undefined) {
    initialValue = JSON.parse(lsValue as string) as T;
  }

  const signalFn = createSignal(initialValue) as SignalGetter<T> & WritableSignal<T>;
  const node = signalFn[SIGNAL];

  if (options?.equal) {
    node.equal = options.equal;
  }

  function setValueToLocalStorage(newValue: T) {
    if (newValue === null || newValue === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(newValue));
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
