import { config, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LazySignal } from './lazy-signal';

describe('LazySignal', () => {
  it('starts without a value or loading state', () => {
    const value = new LazySignal(() => of('loaded'));

    expect(value.value()()).toBeUndefined();
    expect(value.isLoading()).toBe(false);
    expect(value.isLoaded()).toBe(false);
  });

  it('loads a value once and reuses it', () => {
    const loader = vi.fn(() => of('loaded'));
    const value = new LazySignal(loader);

    expect(value.load()()).toBe('loaded');
    expect(value.isLoading()).toBe(false);
    expect(value.isLoaded()).toBe(true);

    expect(value.load()()).toBe('loaded');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not start another load while one is in progress', () => {
    const response = new Subject<string>();
    const loader = vi.fn(() => response.asObservable());
    const value = new LazySignal(loader);

    const first = value.load();
    const second = value.load();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(value.isLoading()).toBe(true);
    expect(first()).toBeUndefined();
    expect(second()).toBeUndefined();

    response.next('loaded');
    response.complete();

    expect(first()).toBe('loaded');
    expect(value.isLoading()).toBe(false);
    expect(value.isLoaded()).toBe(true);
  });

  it('resets the value and allows it to be loaded again', () => {
    const loader = vi.fn().mockReturnValueOnce(of('first')).mockReturnValueOnce(of('second'));
    const value = new LazySignal<string>(loader);

    expect(value.load()()).toBe('first');

    value.reset();

    expect(value.value()()).toBeUndefined();
    expect(value.isLoaded()).toBe(false);
    expect(value.load()()).toBe('second');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clears the loading state when the loader errors', async () => {
    const error = new Error('load failed');
    const onUnhandledError = vi.fn();
    const previousHandler = config.onUnhandledError;
    config.onUnhandledError = onUnhandledError;

    try {
      const value = new LazySignal(() => throwError(() => error));

      expect(value.load()()).toBeUndefined();
      expect(value.isLoading()).toBe(false);
      expect(value.isLoaded()).toBe(false);

      await vi.waitFor(() => expect(onUnhandledError).toHaveBeenCalledWith(error));
    } finally {
      config.onUnhandledError = previousHandler;
    }
  });
});
