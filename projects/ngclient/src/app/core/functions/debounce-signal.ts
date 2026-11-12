import { CreateSignalOptions, signal, WritableSignal } from '@angular/core';

export function debounceSignal<T>(initialValue: T, time: number, options?: CreateSignalOptions<T>): WritableSignal<T> {
  const value = signal(initialValue, options);
  const set = value.set;
  const update = value.update;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Evaluate update callbacks only when the last scheduled write commits, as before.
  value.set = (newValue: T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => set(newValue), time);
  };

  value.update = (updateFn: (value: T) => T) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => update(updateFn), time);
  };

  return value;
}
