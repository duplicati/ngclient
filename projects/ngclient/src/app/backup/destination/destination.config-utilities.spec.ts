import { describe, expect, it } from 'vitest';
import type { ValueOfDestinationFormGroup } from './destination.config-utilities';
import {
  addPort,
  addServer,
  buildUrl,
  buildUrlFromFields,
  concatPaths,
  encodePathPreservingSlashes,
  getSimplePath,
  removeLeadingSlash,
  UrlLike,
} from './destination.config-utilities';

describe('destination URL utilities', () => {
  describe('UrlLike', () => {
    it('parses URL components while preserving the exact hostname', () => {
      const url = 'https://user:p%40ss@MixedCase.Example:8443/folder/file.txt?mode=read';
      const parsed = new UrlLike(url);

      expect(parsed).toMatchObject({
        originalUrl: url,
        host: 'mixedcase.example:8443',
        hostname: 'mixedcase.example',
        exactHostname: 'MixedCase.Example',
        pathname: '/folder/file.txt',
        port: '8443',
        protocol: 'https:',
        search: '?mode=read',
        username: 'user',
        password: 'p%40ss',
      });
      expect(parsed.searchParams.get('mode')).toBe('read');
    });
  });

  describe('buildUrl', () => {
    it('combines a server, port, and path', () => {
      expect(buildUrl('sftp', 'server.example.com', 22, 'backups/folder', [])).toBe(
        'sftp://server.example.com:22/backups/folder'
      );
    });

    it('supports URLs without a server or path', () => {
      expect(buildUrl('file', null, null, null, [])).toBe('file://');
    });

    it('encodes the server, path, and query parameter values', () => {
      expect(
        buildUrl('s3', 'bucket name', null, 'folder name/file#1', [
          ['authid', 'client id'],
          ['mode', 'read/write'],
        ])
      ).toBe('s3://bucket%20name/folder%20name/file%231?authid=client%20id&mode=read%2Fwrite');
    });

    it('uses the Windows file URL prefix for drive paths', () => {
      expect(buildUrl('file', null, null, 'C:\\Users\\Example\\file.txt', [])).toBe(
        'file:///C%3A%5CUsers%5CExample%5Cfile.txt'
      );
    });

    it('passes a leading slash in the path through as a double slash', () => {
      // buildUrl is destination-agnostic: leading-slash normalization happens in
      // the destination mappers (e.g. webdav strips it, ftp keeps it as an absolute path)
      expect(buildUrl('ftp', 'server', 21, '/absolute/path', [])).toBe('ftp://server:21//absolute/path');
    });
  });

  describe('buildUrlFromFields', () => {
    it('includes advanced and dynamic field values', () => {
      const fields = {
        destinationType: 'webdav',
        custom: {},
        advanced: { ssl: true, username: 'user name' },
        dynamic: { token: 'a/b' },
      } as ValueOfDestinationFormGroup;

      expect(buildUrlFromFields(fields, 'example.com', 443, 'folder')).toBe(
        'webdav://example.com:443/folder?ssl=true&username=user%20name&token=a%2Fb'
      );
    });

    it('uses the file protocol when the destination type is absent', () => {
      const fields = {
        destinationType: null,
        custom: {},
        advanced: {},
        dynamic: {},
      } as ValueOfDestinationFormGroup;

      expect(buildUrlFromFields(fields, null, null, 'C:\\Data')).toBe('file:///C%3A%5CData');
    });
  });

  describe('path helpers', () => {
    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['folder', 'folder'],
      ['/folder', 'folder'],
      ['//folder', '/folder'],
    ])('removes one leading slash from %s', (path, expected) => {
      expect(removeLeadingSlash(path)).toBe(expected);
    });

    it.each([
      [[], ''],
      [[null], ''],
      [['server', 'folder', 'file'], 'server/folder/file'],
      [['server/', 'folder', 'file'], 'server/folder/file'],
      [['server', null, '', undefined, 'folder'], 'server/folder'],
      // A leading slash in a segment is preserved as a double slash: FTP backends
      // rely on this to express absolute paths (see the aftp/ftp `doubleSlash` config)
      [['server', '/absolute/path'], 'server//absolute/path'],
      [['server/', '/absolute/path'], 'server//absolute/path'],
    ] as const)('concatenates path segments from %j', (paths, expected) => {
      expect(concatPaths(...paths)).toBe(expected);
    });

    it('encodes path segments without encoding slashes', () => {
      expect(encodePathPreservingSlashes('folder name/file#1/日本語')).toBe(
        'folder%20name/file%231/%E6%97%A5%E6%9C%AC%E8%AA%9E'
      );
    });
  });

  describe('getSimplePath', () => {
    it.each([null, undefined, '', 'not a URL'])('returns an empty string for %s', (url) => {
      expect(getSimplePath(url)).toBe('');
    });

    it('decodes the hostname and path without credentials or query parameters', () => {
      expect(getSimplePath('s3://user:password@m%C3%BCnchen.example/folder%20name/file.txt?mode=read')).toBe(
        'münchen.example/folder name/file.txt'
      );
    });

    it('preserves the original hostname casing', () => {
      expect(getSimplePath('https://MixedCase.Example/folder')).toBe('MixedCase.Example/folder');
    });

    it('omits the slash for a root path', () => {
      expect(getSimplePath(new UrlLike('s3://Bucket/'))).toBe('Bucket');
    });
  });

  describe('server and port helpers', () => {
    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['server.example.com', 'server.example.com'],
      ['server.example.com/', 'server.example.com'],
    ])('normalizes server %s', (server, expected) => {
      expect(addServer(server)).toBe(expected);
    });

    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['443', ':443'],
      [22, ':22'],
      [0, ':0'],
    ])('formats port %s', (port, expected) => {
      expect(addPort(port)).toBe(expected);
    });
  });
});
