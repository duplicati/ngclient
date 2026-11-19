import { describe, expect, it } from 'vitest';
import {
  fromTargetPath,
  getConfigurationByKey,
  getConfigurationByUrl,
  UrlLike,
  type ValueOfDestinationFormGroup,
} from './destination.config-utilities';
import { POSTGRESQL_DEFAULT_SOURCE_URL, POSTGRESQL_SCHEME } from './destination.postgresql';

const postgresql = getConfigurationByKey(POSTGRESQL_SCHEME);

describe('PostgreSQL source mapper', () => {
  it('writes the connection options first and leaves out empty ones', () => {
    const url = postgresql.mapper.to({
      destinationType: POSTGRESQL_SCHEME,
      custom: {},
      advanced: {
        'postgresql-sslrootcert': '/certs/root.crt',
        'postgresql-include-large-objects': true,
        'postgresql-client-path': '',
      },
      dynamic: {
        'postgresql-sslmode': 'verify-full',
        'postgresql-password': 'p@ss%w&rd',
        'postgresql-username': 'backup',
        'postgresql-database': 'app',
        'postgresql-port': 5432,
        'postgresql-host': 'db.example.com',
      },
    } as ValueOfDestinationFormGroup);

    expect(url).toBe(
      'postgresql://?postgresql-host=db.example.com&postgresql-port=5432&postgresql-database=app' +
        '&postgresql-username=backup&postgresql-password=p%40ss%25w%26rd&postgresql-sslmode=verify-full' +
        '&postgresql-include-large-objects=true&postgresql-sslrootcert=%2Fcerts%2Froot.crt'
    );
  });

  it('round-trips a source URL, keeping the fields and the advanced options apart', () => {
    const url =
      'postgresql://?postgresql-host=db.example.com&postgresql-port=6543&postgresql-database=app' +
      '&postgresql-username=backup&postgresql-password=p%40ss%25w%26rd&postgresql-sslmode=require' +
      '&postgresql-include-large-objects=true';
    const fields = fromTargetPath(url);

    expect(fields).not.toBeNull();
    expect(fields!.destinationType).toBe(POSTGRESQL_SCHEME);
    expect(fields!.dynamic).toEqual({
      'postgresql-host': 'db.example.com',
      'postgresql-port': '6543',
      'postgresql-database': 'app',
      'postgresql-username': 'backup',
      'postgresql-password': 'p@ss%w&rd',
      'postgresql-sslmode': 'require',
    });
    expect(fields!.advanced).toEqual({ 'postgresql-include-large-objects': 'true' });
    expect(postgresql.mapper.to(fields!)).toBe(url);
  });

  it.each(['postgres', 'postgresql'])('reads a pasted %s:// connection string', (scheme) => {
    const pasted = `${scheme}://backup%40tenant:s%2Fcret@Db.Example.com:6543/app_db?sslmode=verify-full&application_name=x`;

    expect(getConfigurationByUrl(pasted).key).toBe(POSTGRESQL_SCHEME);

    const fields = fromTargetPath(pasted);
    expect(fields).not.toBeNull();
    expect(fields!.destinationType).toBe(POSTGRESQL_SCHEME);
    expect(fields!.advanced).toEqual({});
    expect(fields!.dynamic).toEqual({
      'postgresql-host': 'Db.Example.com',
      'postgresql-port': '6543',
      'postgresql-database': 'app_db',
      'postgresql-username': 'backup@tenant',
      'postgresql-password': 's/cret',
      'postgresql-sslmode': 'verify-full',
    });

    const saved = new UrlLike(postgresql.mapper.to(fields!));
    expect(saved.protocol).toBe(`${POSTGRESQL_SCHEME}:`);
    expect(saved.hostname).toBe('');
    expect(saved.searchParams.get('postgresql-password')).toBe('s/cret');
  });

  it('fills in the default port and TLS mode of a connection string without them', () => {
    const fields = fromTargetPath('postgres://backup@db.example.com/app');

    expect(fields!.dynamic).toEqual({
      'postgresql-host': 'db.example.com',
      'postgresql-port': '5432',
      'postgresql-database': 'app',
      'postgresql-username': 'backup',
      'postgresql-sslmode': 'require',
    });
  });

  it('starts a new source with the default port and TLS mode', () => {
    expect(postgresql.mapper.default!('')).toBe(POSTGRESQL_DEFAULT_SOURCE_URL);
    expect(fromTargetPath(POSTGRESQL_DEFAULT_SOURCE_URL)!.dynamic).toEqual({
      'postgresql-port': '5432',
      'postgresql-sslmode': 'require',
    });
  });

  it('does not take over the URLs of other types', () => {
    expect(getConfigurationByUrl('ssh://db.example.com/app').key).toBe('ssh');
    expect(getConfigurationByUrl(POSTGRESQL_DEFAULT_SOURCE_URL).key).toBe(POSTGRESQL_SCHEME);
  });

  it('keeps a root certificate given as text through a save and a load', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIBszCC+/=\n-----END CERTIFICATE-----\n';
    const url = postgresql.mapper.to({
      destinationType: POSTGRESQL_SCHEME,
      custom: {},
      advanced: { 'postgresql-sslrootcert-content': pem },
      dynamic: {
        'postgresql-host': 'db.example.com',
        'postgresql-database': 'app',
        'postgresql-username': 'backup',
        'postgresql-sslmode': 'verify-full',
      },
    } as ValueOfDestinationFormGroup);

    expect(url).not.toContain('\n');
    expect(fromTargetPath(url)!.advanced).toEqual({ 'postgresql-sslrootcert-content': pem });
  });
});
