import { computed, isSignal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounceSignal } from './debounce-signal';

describe('debounceSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps the initial value until the last write has waited the full delay', () => {
    const value = debounceSignal(1, 300);
    const doubled = computed(() => value() * 2);
    expect(isSignal(value)).toBe(true);
    expect(doubled()).toBe(2);
    value.set(2);
    vi.advanceTimersByTime(200);
    value.set(3);
    vi.advanceTimersByTime(299);
    expect(value()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(doubled()).toBe(6);
  });

  it('replaces pending updates rather than accumulating them', () => {
    const value = debounceSignal(1, 300);
    const discarded = vi.fn((n: number) => n + 10);
    const last = vi.fn((n: number) => n + 2);
    value.update(discarded);
    value.update(last);
    expect(last).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(discarded).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledExactlyOnceWith(1);
    expect(value()).toBe(3);
  });

  it('lets a set replace an update and an update replace a set', () => {
    const value = debounceSignal(1, 300);
    value.update(() => 9);
    value.set(4);
    vi.advanceTimersByTime(300);
    expect(value()).toBe(4);
    value.set(10);
    value.update((n) => n + 1);
    vi.advanceTimersByTime(300);
    expect(value()).toBe(5);
  });

  it('applies custom equality when the timer fires', () => {
    const value = debounceSignal({ id: 1 }, 300, { equal: (a, b) => a.id === b.id });
    const initial = value();
    value.set({ id: 1 });
    vi.advanceTimersByTime(300);
    expect(value()).toBe(initial);
    value.set({ id: 2 });
    vi.advanceTimersByTime(300);
    expect(value()).toEqual({ id: 2 });
  });
});
