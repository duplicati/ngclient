import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordGeneratorService } from './password-generator.service';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto');

describe('PasswordGeneratorService', () => {
  let service: PasswordGeneratorService;
  let getRandomValuesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getRandomValuesMock = vi.fn((result: Uint8Array) => result);
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      value: { getRandomValues: getRandomValuesMock },
    });
    service = new PasswordGeneratorService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCryptoDescriptor) {
      Object.defineProperty(window, 'crypto', originalCryptoDescriptor);
    } else {
      delete (window as unknown as Record<string, unknown>)['crypto'];
    }
  });

  const returnByte = (value: number) =>
    getRandomValuesMock.mockImplementationOnce((result: Uint8Array) => {
      result[0] = value;
      return result;
    });

  it.each([
    ['', 1],
    ['abcdefgh', 2],
    ['abcdEFGH', 3],
    ['abcdEF12', 4],
    ['abcdEF1!', 5],
    ['VeryLongPassword123!WithMoreCharacters', 5],
  ])('assigns strength %s to %s', (password, expectedStrength) => {
    expect(service.calculatePasswordStrength(password)).toBe(expectedStrength);
  });

  it('generates the requested length using the default pattern', () => {
    returnByte('A'.charCodeAt(0));
    returnByte('z'.charCodeAt(0));
    returnByte('0'.charCodeAt(0));
    returnByte('!'.charCodeAt(0));

    expect(service.generatePassword(4)).toBe('Az0!');
    expect(getRandomValuesMock).toHaveBeenCalledTimes(4);
  });

  it('rejects characters outside a custom pattern', () => {
    returnByte('C'.charCodeAt(0));
    returnByte('A'.charCodeAt(0));
    returnByte('D'.charCodeAt(0));
    returnByte('B'.charCodeAt(0));

    expect(service.generatePassword(2, /[AB]/)).toBe('AB');
    expect(getRandomValuesMock).toHaveBeenCalledTimes(4);
  });

  it('retries until a strong password is generated', () => {
    const generatePassword = vi
      .spyOn(service, 'generatePassword')
      .mockReturnValueOnce('abcdefgh')
      .mockReturnValueOnce('Abcdef1!');

    expect(service.generate(8)).toBe('Abcdef1!');
    expect(generatePassword).toHaveBeenCalledTimes(2);
    expect(generatePassword).toHaveBeenNthCalledWith(1, 8, expect.any(RegExp));
    expect(generatePassword).toHaveBeenNthCalledWith(2, 8, expect.any(RegExp));
  });
});
