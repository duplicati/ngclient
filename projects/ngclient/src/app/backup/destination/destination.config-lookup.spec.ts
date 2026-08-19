import { describe, expect, it } from 'vitest';
import {
  fromSearchParams,
  fromUrlObj,
  getAllConfigurationsByKey,
  getBackendIcon,
  getBackendType,
  getConfigurationByKey,
  getConfigurationByUrl,
  getRemotePathDisplayName,
  UrlLike,
} from './destination.config-utilities';

describe('destination configuration lookup', () => {
  describe('getConfigurationByKey', () => {
    it('returns a configuration by its primary key', () => {
      expect(getConfigurationByKey('webdav')).toMatchObject({
        key: 'webdav',
        displayName: 'WebDAV',
        icon: 'assets/dest-icons/webdav.png',
      });
    });

    it('returns a configuration by its custom key', () => {
      expect(getConfigurationByKey('s3-aws')).toMatchObject({
        key: 's3',
        customKey: 's3-aws',
        displayName: 'Amazon S3',
      });
    });

    it('supports the legacy SSL suffix', () => {
      expect(getConfigurationByKey('ftps')).toMatchObject({
        key: 'ftp',
        displayName: 'FTP',
      });
    });

    it('creates a default configuration for an unknown key', () => {
      const configuration = getConfigurationByKey('custombackend');

      expect(configuration).toMatchObject({
        key: 'custombackend',
        displayName: 'custombackend',
        description: 'Unknown destination type',
        icon: 'assets/dest-icons/file-system.png',
      });
      expect(configuration.mapper.to).toBeTypeOf('function');
      expect(configuration.mapper.from).toBeTypeOf('function');
    });
  });

  describe('getAllConfigurationsByKey', () => {
    it('returns every configuration sharing a primary key', () => {
      const configurations = getAllConfigurationsByKey('storj');

      expect(configurations.map(({ customKey }) => customKey)).toEqual(
        expect.arrayContaining(['storjAccessGrant', 'storjApiKey'])
      );
      expect(configurations.every(({ key }) => key === 'storj')).toBe(true);
    });

    it('can select a single configuration by its custom key', () => {
      expect(getAllConfigurationsByKey('storjApiKey').map(({ customKey }) => customKey)).toEqual(['storjApiKey']);
    });

    it('returns an empty array for an unknown key', () => {
      expect(getAllConfigurationsByKey('custombackend')).toEqual([]);
    });
  });

  describe('getConfigurationByUrl', () => {
    it.each([
      ['webdav://server.example.com/folder', { key: 'webdav', displayName: 'WebDAV' }],
      [
        's3://bucket/folder?s3-server-name=s3.amazonaws.com',
        { key: 's3', customKey: 's3-aws', displayName: 'Amazon S3' },
      ],
      [
        's3://bucket/folder?s3-server-name=s3.wasabisys.com',
        { key: 's3', customKey: 's3-wasabi', displayName: 'Wasabi Hot Storage (S3)' },
      ],
      [
        'storj://storj.io/config?storj-shared-access=grant',
        { key: 'storj', customKey: 'storjAccessGrant', displayName: 'Storj Access Grant' },
      ],
      [
        'storj://storj.io/config?storj-api-key=key&storj-secret=secret',
        { key: 'storj', customKey: 'storjApiKey', displayName: 'Storj API Key' },
      ],
    ])('selects the matching configuration for %s', (url, expected) => {
      expect(getConfigurationByUrl(url)).toMatchObject(expected);
    });

    it('falls back to a default configuration for an unknown URL scheme', () => {
      expect(getConfigurationByUrl('custombackend://server/folder')).toMatchObject({
        key: 'custombackend',
        displayName: 'custombackend',
        icon: 'assets/dest-icons/file-system.png',
      });
    });
  });

  describe('display information', () => {
    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['diskimage://local', 'assets/dest-icons/external-harddrive.png'],
      ['webdav://server/folder', 'assets/dest-icons/webdav.png'],
      ['s3://bucket?s3-server-name=s3.amazonaws.com', 'assets/dest-icons/aws.png'],
      ['custombackend://server/folder', 'assets/dest-icons/file-system.png'],
    ])('returns the backend icon for %s', (url, expected) => {
      expect(getBackendIcon(url)).toBe(expected);
    });

    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['diskimage://local', 'Local disk'],
      ['webdav://server/folder', 'WebDAV'],
      ['s3://bucket?s3-server-name=s3.amazonaws.com', 'Amazon S3'],
      ['custombackend://server/folder', 'custombackend'],
    ])('returns the remote path display name for %s', (url, expected) => {
      expect(getRemotePathDisplayName(url)).toBe(expected);
    });

    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['file://C:%5CData', 'Local'],
      ['webdav://server/folder', 'WebDAV'],
      ['s3://bucket?s3-server-name=STORAGE.MIN.IO', 'MinIO S3'],
      ['s3://bucket?s3-server-name=storage.example.com', 'S3 Compatible'],
    ])('returns the backend type for %s', (url, expected) => {
      expect(getBackendType(url)).toBe(expected);
    });
  });

  describe('option parsing', () => {
    it('extracts and decodes URL components', () => {
      expect(fromUrlObj(new UrlLike('sftp://Bucket%20Name:2222/folder%20name/file.txt'))).toEqual({
        bucket: 'Bucket Name',
        server: 'Bucket Name',
        port: '2222',
        path: 'folder name/file.txt',
      });
    });

    it('separates WebDAV dynamic fields from advanced fields', () => {
      const url = new UrlLike(
        'webdav://server?use-ssl=true&auth-username=user%20name&debug-propfind-file=trace.txt&custom-option=value'
      );

      expect(fromSearchParams('webdav', url)).toEqual({
        dynamic: {
          'use-ssl': 'true',
          'auth-username': 'user name',
        },
        advanced: {
          'debug-propfind-file': 'trace.txt',
          'custom-option': 'value',
        },
      });
    });

    it('recognizes object-based dynamic field declarations', () => {
      const url = new UrlLike('s3://bucket?s3-server-name=storage.example.com&use-ssl=true&s3-client=minio');

      expect(fromSearchParams('s3', url)).toEqual({
        dynamic: {
          's3-server-name': 'storage.example.com',
          'use-ssl': 'true',
        },
        advanced: {
          's3-client': 'minio',
        },
      });
    });

    it('treats every option as advanced for an unknown destination', () => {
      const url = new UrlLike('custombackend://server?first=value&second=other');

      expect(fromSearchParams('custombackend', url)).toEqual({
        dynamic: {},
        advanced: {
          first: 'value',
          second: 'other',
        },
      });
    });
  });
});
