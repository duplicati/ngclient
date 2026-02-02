import { ValueEqualityFn } from '@angular/core';
import {
  createLinkedSignal,
  LinkedSignalGetter,
  LinkedSignalNode,
  linkedSignalSetFn,
  linkedSignalUpdateFn,
  SIGNAL,
} from '@angular/core/primitives/signals';

type RevertableSignal<D> = {
  set: (newValue: D) => () => void;
  update: (updateFn: (value: D) => D) => () => void;
};

const identityFn = <T>(v: T) => v;

export function revertableSignal<D>(
  computation: () => D,
  options?: { equal?: ValueEqualityFn<D>; debugName?: string }
) {
  const getter = createLinkedSignal<D, D>(computation, identityFn<D>, options?.equal) as LinkedSignalGetter<D, D> &
    RevertableSignal<D>;
  if (ngDevMode) {
    getter.toString = () => `[RevertableSignal: ${getter()}]`;
    getter[SIGNAL].debugName = options?.debugName;
  }

  type S = NoInfer<D>;
  const node = getter[SIGNAL] as LinkedSignalNode<S, D>;
  const upgradedGetter = getter as RevertableSignal<D>;

  upgradedGetter.set = (newValue: D) => {
    const prevValue = getter();

    linkedSignalSetFn(node, newValue);

    return () => {
      linkedSignalSetFn(node, prevValue);
    };
  };

  upgradedGetter.update = (updateFn: (value: D) => D) => {
    const prevValue = getter();

    linkedSignalUpdateFn(node, updateFn);

    return () => {
      linkedSignalSetFn(node, prevValue);
    };
  };

  return getter;
}
