import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRandomValues, randomUUID } from './crypto';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto');
const originalMsCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'msCrypto');

const setWindowProperty = (name: 'crypto' | 'msCrypto', value: unknown) => {
  Object.defineProperty(window, name, {
    configurable: true,
    value,
  });
};

const restoreWindowProperty = (name: 'crypto' | 'msCrypto', descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
  } else {
    delete (window as unknown as Record<string, unknown>)[name];
  }
};

describe('crypto utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreWindowProperty('crypto', originalCryptoDescriptor);
    restoreWindowProperty('msCrypto', originalMsCryptoDescriptor);
  });

  it('uses the native randomUUID implementation when available', () => {
    const nativeRandomUUID = vi.fn(() => '123e4567-e89b-42d3-a456-426614174000');
    setWindowProperty('crypto', { randomUUID: nativeRandomUUID });

    expect(randomUUID()).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(nativeRandomUUID).toHaveBeenCalledOnce();
  });

  it('generates an RFC 4122 version 4 UUID when the native implementation is unavailable', () => {
    setWindowProperty('crypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    expect(randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uses Web Crypto random values before legacy fallbacks', () => {
    const webCryptoGetRandomValues = vi.fn((result: Uint8Array) => {
      result[0] = 231;
      return result;
    });
    const msCryptoGetRandomValues = vi.fn();
    const mathRandom = vi.spyOn(Math, 'random');
    setWindowProperty('crypto', { getRandomValues: webCryptoGetRandomValues });
    setWindowProperty('msCrypto', { getRandomValues: msCryptoGetRandomValues });

    expect(getRandomValues()).toBe(231);
    expect(webCryptoGetRandomValues).toHaveBeenCalledOnce();
    expect(webCryptoGetRandomValues.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(webCryptoGetRandomValues.mock.calls[0][0]).toHaveLength(1);
    expect(msCryptoGetRandomValues).not.toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('uses msCrypto when Web Crypto is unavailable', () => {
    const msCryptoGetRandomValues = vi.fn((result: Uint8Array) => {
      result[0] = 91;
      return result;
    });
    const mathRandom = vi.spyOn(Math, 'random');
    setWindowProperty('crypto', undefined);
    setWindowProperty('msCrypto', { getRandomValues: msCryptoGetRandomValues });

    expect(getRandomValues()).toBe(91);
    expect(msCryptoGetRandomValues).toHaveBeenCalledOnce();
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('uses Math.random as the final byte fallback', () => {
    setWindowProperty('crypto', undefined);
    setWindowProperty('msCrypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(getRandomValues()).toBe(128);
  });
});
