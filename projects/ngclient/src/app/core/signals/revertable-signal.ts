import { linkedSignal, Signal, ValueEqualityFn } from '@angular/core';

export function revertableSignal<D>(
  computation: () => D,
  options?: { equal?: ValueEqualityFn<D>; debugName?: string }
): Signal<D> & { set: (value: D) => () => void; update: (fn: (value: D) => D) => () => void } {
  const getter = linkedSignal(computation, options);
  const set = getter.set;
  const update = getter.update;

  if (ngDevMode) {
    getter.toString = () => `[RevertableSignal: ${getter()}]`;
  }

  return Object.assign(getter, {
    set: (newValue: D) => {
      const prevValue = getter();
      set(newValue);
      return () => set(prevValue);
    },
    update: (updateFn: (value: D) => D) => {
      const prevValue = getter();
      update(updateFn);
      return () => set(prevValue);
    },
  });
}
