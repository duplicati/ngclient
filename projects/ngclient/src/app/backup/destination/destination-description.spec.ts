import { describe, expect, it } from 'vitest';
import { getDisplayedDescription, resolveSourceDescription } from './destination-description';

describe('destination descriptions', () => {
  it('prefers a configured source description over the server description', () => {
    expect(
      resolveSourceDescription('Configured source description', 'Server description', 'Destination description')
    ).toBe('Configured source description');
  });

  it('falls back to the server description', () => {
    expect(resolveSourceDescription(null, 'Server description', 'Destination description')).toBe('Server description');
  });

  it('falls back to the destination description', () => {
    expect(resolveSourceDescription(null, null, 'Destination description')).toBe('Destination description');
  });

  it('keeps the destination description outside source mode', () => {
    expect(
      getDisplayedDescription(
        { description: 'Destination description', sourceDescription: 'Configured source description' },
        false
      )
    ).toBe('Destination description');
  });
});
