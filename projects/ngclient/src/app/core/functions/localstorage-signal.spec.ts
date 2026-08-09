import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { localStorageSignal } from './localstorage-signal';

describe('localStorageSignal', () => {
  let storage: LOCALSTORAGE;

  beforeEach(() => {
    storage = {
      getItemParsed: vi.fn(),
      setItemParsed: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as LOCALSTORAGE;

    TestBed.configureTestingModule({
      providers: [{ provide: LOCALSTORAGE, useValue: storage }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function create<T>(initialValue: T, persistThroughClear = false) {
    return TestBed.runInInjectionContext(() => localStorageSignal('setting', initialValue, persistThroughClear));
  }

  it('uses the initial value when storage is empty', () => {
    vi.mocked(storage.getItemParsed).mockReturnValue(null);

    const value = create('initial');

    expect(value()).toBe('initial');
    expect(storage.getItemParsed).toHaveBeenCalledWith('setting', false);
  });

  it.each([
    [false, true],
    [0, 10],
  ] as const)('uses the stored value %s instead of the initial value', (stored, initial) => {
    vi.mocked(storage.getItemParsed).mockReturnValue(stored);

    expect(create(initial)()).toBe(stored);
  });

  it('persists values set directly', () => {
    const value = create(1);

    value.set(2);

    expect(value()).toBe(2);
    expect(storage.setItemParsed).toHaveBeenCalledWith('setting', 2, false);
  });

  it('persists values produced by update', () => {
    const value = create(2);

    value.update((current) => current * 3);

    expect(value()).toBe(6);
    expect(storage.setItemParsed).toHaveBeenCalledWith('setting', 6, false);
  });

  it.each([null, undefined])('removes the stored value when set to %s', (nextValue) => {
    const value = create<string | null | undefined>('initial');

    value.set(nextValue);

    expect(value()).toBe(nextValue);
    expect(storage.removeItem).toHaveBeenCalledWith('setting');
    expect(storage.setItemParsed).not.toHaveBeenCalled();
  });

  it('propagates persistThroughClear to reads and writes', () => {
    const value = create('initial', true);

    value.set('updated');

    expect(storage.getItemParsed).toHaveBeenCalledWith('setting', true);
    expect(storage.setItemParsed).toHaveBeenCalledWith('setting', 'updated', true);
  });
});
