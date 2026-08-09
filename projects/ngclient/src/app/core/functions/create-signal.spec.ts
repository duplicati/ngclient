import { describe, expect, it, vi } from 'vitest';
import { createSignal } from './create-signal';

describe('createSignal', () => {
  it('exposes the initial value through the getter and value property', () => {
    const value = createSignal('initial');

    expect(value()).toBe('initial');
    expect(value.value).toBe('initial');
  });

  it('supports set and update', () => {
    const value = createSignal(2);

    value.set(4);
    value.update((current) => current + 3);

    expect(value()).toBe(7);
  });

  it('updates the signal by assigning to the value property', () => {
    const value = createSignal('before');

    value.value = 'after';

    expect(value()).toBe('after');
  });

  it('passes a custom equality function to the underlying signal', () => {
    const equal = vi.fn((previous: { id: number }, next: { id: number }) => previous.id === next.id);
    const value = createSignal({ id: 1, label: 'initial' }, { equal });
    const initial = value();

    value.set({ id: 1, label: 'ignored' });

    expect(equal).toHaveBeenCalled();
    expect(value()).toBe(initial);

    value.set({ id: 2, label: 'updated' });
    expect(value()).toEqual({ id: 2, label: 'updated' });
  });
});
