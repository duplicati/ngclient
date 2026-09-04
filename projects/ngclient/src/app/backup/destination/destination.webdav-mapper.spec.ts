import { describe, expect, it } from 'vitest';
import {
  fromTargetPath,
  getConfigurationByKey,
  UrlLike,
  type ValueOfDestinationFormGroup,
} from './destination.config-utilities';

const webdav = getConfigurationByKey('webdav');

function webdavFields(path: string, port: string | null = '443'): ValueOfDestinationFormGroup {
  return {
    destinationType: 'webdav',
    custom: {
      server: 'webdav.example.com',
      port,
      path,
    },
    advanced: {
      'debug-propfind-file': 'trace file.txt',
    },
    dynamic: {
      'use-ssl': true,
      'auth-username': 'user name',
      'auth-password': 'secret',
    },
  } as ValueOfDestinationFormGroup;
}

describe('WebDAV destination mapper', () => {
  it.each(['/Sicherung/nuc/config', 'Sicherung/nuc/config', '///Sicherung/nuc/config'])(
    'normalizes the leading slash in %s',
    (path) => {
      const targetUrl = webdav.mapper.to(webdavFields(path));

      expect(targetUrl).not.toContain(':443//');
      expect(new UrlLike(targetUrl).pathname).toBe('/Sicherung/nuc/config');
    }
  );

  it('round-trips an existing valid URL without changing its path', () => {
    const targetUrl =
      'webdav://webdav.example.com:443/Sicherung/nuc/config?debug-propfind-file=trace%20file.txt&use-ssl=true&auth-username=user%20name&auth-password=secret';
    const fields = fromTargetPath(targetUrl);

    expect(fields).not.toBeNull();
    const result = new UrlLike(webdav.mapper.to(fields!));

    expect(result.host).toBe('webdav.example.com:443');
    expect(result.pathname).toBe('/Sicherung/nuc/config');
    expect(Object.fromEntries(result.searchParams)).toEqual({
      'debug-propfind-file': 'trace file.txt',
      'use-ssl': 'true',
      'auth-username': 'user name',
      'auth-password': 'secret',
    });
  });

  it('repairs a double-slash URL when it is loaded and saved again', () => {
    const fields = fromTargetPath(
      'webdav://webdav.example.com:443//Sicherung/nuc/config?use-ssl=true&auth-username=user&auth-password=secret'
    );

    expect(fields).not.toBeNull();
    const result = webdav.mapper.to(fields!);

    expect(result).not.toContain(':443//');
    expect(new UrlLike(result).pathname).toBe('/Sicherung/nuc/config');
  });

  it('preserves an empty path and omitted port', () => {
    expect(webdav.mapper.to(webdavFields('', null))).toBe(
      'webdav://webdav.example.com?debug-propfind-file=trace%20file.txt&use-ssl=true&auth-username=user%20name&auth-password=secret'
    );
  });

  it('does not change the absolute-path semantics of alternative FTP', () => {
    const aftp = getConfigurationByKey('aftp');
    const fields = {
      destinationType: 'aftp',
      custom: {
        server: 'ftp.example.com',
        port: null,
        path: '/absolute/path',
      },
      advanced: {},
      dynamic: {},
    } as ValueOfDestinationFormGroup;

    expect(aftp.mapper.to(fields)).toBe('aftp://ftp.example.com//absolute/path');
  });
});
