import { describe, expect, it } from 'vitest';
import {
  fromTargetPath,
  getConfigurationByKey,
  UrlLike,
  ValueOfDestinationFormGroup,
} from './destination.config-utilities';

const pcloud = getConfigurationByKey('pcloud');
const authid = 'test-token+with/slashes=and&symbols';

describe('pCloud destination editing', () => {
  it.each(['api.pcloud.com', 'eapi.pcloud.com'])('preserves the %s region and credentials on reload/save', (server) => {
    const original = `pcloud://${server}/Backup%20files/Family?authid=${encodeURIComponent(authid)}&pcloud-folderid=42`;
    const fields = fromTargetPath(original)!;

    expect(fields.custom).toMatchObject({ server, path: 'Backup files/Family' });
    expect(fields.dynamic['authid']).toBe(authid);
    expect(fields.advanced['pcloud-folderid']).toBe('42');

    const saved = new UrlLike(pcloud.mapper.to(fields));
    expect(saved.hostname).toBe(server);
    expect(saved.pathname).toBe('/Backup%20files/Family');
    expect(Object.fromEntries(saved.searchParams)).toEqual({ authid, 'pcloud-folderid': '42' });
  });

  it.each(['api.pcloud.com', 'eapi.pcloud.com'])('preserves an empty path at %s', (server) => {
    const fields = fromTargetPath(`pcloud://${server}?authid=${encodeURIComponent(authid)}`)!;
    expect(fields.custom.path).toBe('');
    const saved = new UrlLike(pcloud.mapper.to(fields));
    expect(saved.hostname).toBe(server);
    expect(saved.pathname).toBe('');
    expect(saved.searchParams.get('authid')).toBe(authid);
  });

  it('changes the region without dropping the existing folder or authentication token', () => {
    const fields = fromTargetPath(`pcloud://api.pcloud.com/backup?authid=${encodeURIComponent(authid)}`)!;
    fields.custom.server = 'eapi.pcloud.com';
    const saved = new UrlLike(pcloud.mapper.to(fields));
    expect(saved.hostname).toBe('eapi.pcloud.com');
    expect(saved.pathname).toBe('/backup');
    expect(saved.searchParams.get('authid')).toBe(authid);
  });

  it('edits a folder without moving the destination out of Europe', () => {
    const fields = fromTargetPath(`pcloud://eapi.pcloud.com/old?authid=${encodeURIComponent(authid)}`)!;
    fields.custom.path = 'new folder/写真';
    const saved = fromTargetPath(pcloud.mapper.to(fields)) as ValueOfDestinationFormGroup;
    expect(saved.custom).toMatchObject({ server: 'eapi.pcloud.com', path: 'new folder/写真' });
    expect(saved.dynamic['authid']).toBe(authid);
  });
});
