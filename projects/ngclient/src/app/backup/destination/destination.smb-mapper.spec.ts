import { describe, expect, it } from 'vitest';
import { fromTargetPath, toTargetPath, ValueOfDestinationFormGroup } from './destination.config-utilities';

describe('SMB destination mapper', () => {
  const fields: ValueOfDestinationFormGroup = {
    destinationType: 'smb',
    custom: {
      server: 'nas.local',
      share: 'backups',
      path: 'duplicati/photos',
    },
    dynamic: {
      'auth-username': 'user',
      // A bare "%" and an already encoded "%25" must both survive the round trip
      'auth-password': 'pa%ss%25word',
      'auth-domain': 'WORKGROUP',
    },
    advanced: {},
  };

  it('encodes a password containing a percent sign', () => {
    expect(toTargetPath(fields)).toBe(
      'smb://nas.local/backups/duplicati/photos?auth-username=user&auth-password=pa%25ss%2525word&auth-domain=WORKGROUP'
    );
  });

  it('round-trips a password containing a percent sign', () => {
    const parsed = fromTargetPath(toTargetPath(fields));

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      destinationType: 'smb',
      custom: { server: 'nas.local', share: 'backups', path: 'duplicati/photos' },
      dynamic: {
        'auth-username': 'user',
        'auth-password': 'pa%ss%25word',
        'auth-domain': 'WORKGROUP',
      },
    });
  });

  it('parses a password ending in a percent sign', () => {
    const parsed = fromTargetPath('smb://nas.local/backups?auth-username=user&auth-password=secret%25');

    expect(parsed?.dynamic['auth-password']).toBe('secret%');
  });
});
