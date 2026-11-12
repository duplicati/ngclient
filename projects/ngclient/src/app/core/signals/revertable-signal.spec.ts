import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { revertableSignal } from './revertable-signal';

describe('revertableSignal', () => {
  it('uses the computation value and follows its source', () => {
    const source = signal(1);
    const value = revertableSignal(() => source());

    expect(value()).toBe(1);

    source.set(2);
    expect(value()).toBe(2);
  });

  it('sets a value and returns a callback that restores the previous value', () => {
    const value = revertableSignal(() => 'initial');

    const revert = value.set('updated');

    expect(value()).toBe('updated');

    revert();
    expect(value()).toBe('initial');
  });

  it('updates a value and returns a callback that restores the previous value', () => {
    const value = revertableSignal(() => 2);

    const revert = value.update((current) => current * 3);

    expect(value()).toBe(6);

    revert();
    expect(value()).toBe(2);
  });

  it('uses a custom equality function', () => {
    const equal = vi.fn((previous: { id: number }, next: { id: number }) => previous.id === next.id);
    const value = revertableSignal(() => ({ id: 1, label: 'initial' }), { equal });
    const initial = value();
    equal.mockClear();

    value.set({ id: 1, label: 'ignored' });

    expect(equal).toHaveBeenCalled();
    expect(value()).toBe(initial);

    value.set({ id: 2, label: 'updated' });
    expect(value()).toEqual({ id: 2, label: 'updated' });
  });
  it('restores each captured value even when writes overlap', () => {
    const value = revertableSignal(() => 1);
    const first = value.set(2);
    const second = value.update((n) => n + 1);
    first();
    expect(value()).toBe(1);
    second();
    expect(value()).toBe(2);
  });

  it('follows external changes and retains the captured rollback value', () => {
    const source = signal(1);
    const value = revertableSignal(() => source());
    const revert = value.set(2);
    source.set(3);
    expect(value()).toBe(3);
    revert();
    expect(value()).toBe(1);
    source.set(4);
    expect(value()).toBe(4);
  });
});
