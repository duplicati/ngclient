import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { parseRecursiveObjectOfSignals } from './parse-recursive-signals-object';

describe('parseRecursiveObjectOfSignals', () => {
  it.each([null, undefined, true, 42, 'value'])('returns the primitive value %s unchanged', (value) => {
    expect(parseRecursiveObjectOfSignals(value)).toBe(value);
  });

  it('unwraps a signal', () => {
    expect(parseRecursiveObjectOfSignals(signal('value'))).toBe('value');
  });

  it('recursively unwraps signals in objects', () => {
    const value = {
      name: signal('backup'),
      enabled: signal(true),
      nested: {
        count: signal(3),
        plain: 'value',
      },
    };

    expect(parseRecursiveObjectOfSignals(value)).toEqual({
      name: 'backup',
      enabled: true,
      nested: {
        count: 3,
        plain: 'value',
      },
    });
  });

  it('recursively unwraps signals in arrays', () => {
    const value = [signal('first'), { nested: signal('second') }, [signal('third')]];

    expect(parseRecursiveObjectOfSignals(value)).toEqual(['first', { nested: 'second' }, ['third']]);
  });
});
