import { describe, expect, it } from 'vitest';
import { applyPastedS3Endpoint, S3_DISABLE_CHUNK_ENCODING_OPTION } from './destination.config';
import { DestinationFormValues } from './destination.config-utilities';
import { parseS3EndpointUrl } from './destination.s3-endpoint';

const emptyForm = (): DestinationFormValues => ({ custom: {}, dynamic: {}, advanced: {} });

describe('parseS3EndpointUrl', () => {
  it.each([
    // Virtual-hosted style: bucket in the hostname
    [
      'https://dev-ingress-storage-duplicati.ams3.digitaloceanspaces.com',
      { server: 'ams3.digitaloceanspaces.com', bucket: 'dev-ingress-storage-duplicati', useSsl: true },
    ],
    [
      'https://my-bucket.ams3.cdn.digitaloceanspaces.com/folder/sub',
      { server: 'ams3.digitaloceanspaces.com', bucket: 'my-bucket', path: 'folder/sub', useSsl: true },
    ],
    [
      'https://my.dotted.bucket.s3.eu-west-1.amazonaws.com/',
      { server: 's3.eu-west-1.amazonaws.com', bucket: 'my.dotted.bucket', useSsl: true },
    ],
    ['https://bkt.s3.amazonaws.com', { server: 's3.amazonaws.com', bucket: 'bkt', useSsl: true }],
    ['https://bkt.s3-eu-west-1.amazonaws.com', { server: 's3-eu-west-1.amazonaws.com', bucket: 'bkt', useSsl: true }],
    [
      'https://bkt.s3.eu-central-1.wasabisys.com',
      { server: 's3.eu-central-1.wasabisys.com', bucket: 'bkt', useSsl: true },
    ],
    [
      'https://bkt.s3.us-west-004.backblazeb2.com',
      { server: 's3.us-west-004.backblazeb2.com', bucket: 'bkt', useSsl: true },
    ],
    ['https://bkt.us-east-1.linodeobjects.com', { server: 'us-east-1.linodeobjects.com', bucket: 'bkt', useSsl: true }],
    ['https://bkt.fsn1.your-objectstorage.com', { server: 'fsn1.your-objectstorage.com', bucket: 'bkt', useSsl: true }],
    ['https://bkt.s3.de.io.cloud.ovh.net', { server: 's3.de.io.cloud.ovh.net', bucket: 'bkt', useSsl: true }],
    ['https://bkt.s3.fr-par.scw.cloud', { server: 's3.fr-par.scw.cloud', bucket: 'bkt', useSsl: true }],
    [
      'https://bkt.s3.eu-central-1.ionoscloud.com',
      { server: 's3.eu-central-1.ionoscloud.com', bucket: 'bkt', useSsl: true },
    ],
    ['https://bkt.sos-ch-gva-2.exo.io', { server: 'sos-ch-gva-2.exo.io', bucket: 'bkt', useSsl: true }],
    ['https://bkt.eu-001.s3.synologyc2.net', { server: 'eu-001.s3.synologyc2.net', bucket: 'bkt', useSsl: true }],
    [
      'https://bkt-1250000000.cos.ap-guangzhou.myqcloud.com',
      { server: 'cos.ap-guangzhou.myqcloud.com', bucket: 'bkt-1250000000', useSsl: true },
    ],
    [
      'https://bkt.oss-cn-hangzhou.aliyuncs.com',
      { server: 'oss-cn-hangzhou.aliyuncs.com', bucket: 'bkt', useSsl: true },
    ],
    [
      'https://bkt.0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com',
      { server: '0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com', bucket: 'bkt', useSsl: true },
    ],
    // Path style: bucket in the first path segment
    [
      'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/bkt/folder',
      {
        server: '0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
        bucket: 'bkt',
        path: 'folder',
        useSsl: true,
      },
    ],
    [
      'https://mynamespace.compat.objectstorage.us-ashburn-1.oraclecloud.com/bkt',
      { server: 'mynamespace.compat.objectstorage.us-ashburn-1.oraclecloud.com', bucket: 'bkt', useSsl: true },
    ],
    [
      'https://my_tenant-ns.compat.objectstorage.us-ashburn-1.oraclecloud.com/duplicati-backups',
      {
        server: 'my_tenant-ns.compat.objectstorage.us-ashburn-1.oraclecloud.com',
        bucket: 'duplicati-backups',
        useSsl: true,
      },
    ],
    ['https://s3.wasabisys.com/bkt/a%20b', { server: 's3.wasabisys.com', bucket: 'bkt', path: 'a b', useSsl: true }],
    ['http://minio.local:9000/bkt?x=1', { server: 'minio.local:9000', bucket: 'bkt', useSsl: false }],
    ['https://minio.example.com', { server: 'minio.example.com', useSsl: true }],
    // No scheme
    ['bkt.ams3.digitaloceanspaces.com', { server: 'ams3.digitaloceanspaces.com', bucket: 'bkt' }],
    ['minio.local:9000/bkt', { server: 'minio.local:9000', bucket: 'bkt' }],
    ['S3.AMAZONAWS.COM', { server: 's3.amazonaws.com' }],
  ])('parses %s', (text, expected) => {
    expect(parseS3EndpointUrl(text)).toEqual(expected);
  });

  it.each([
    '',
    'minio.example.com', // plain unknown host: let the paste through as typed
    's3://bucket/path',
    'ftp://host/bucket',
    'https://user:pass@host/bucket',
    'two words',
    'https://',
  ])('ignores %s', (text) => {
    expect(parseS3EndpointUrl(text)).toBeNull();
  });

  it('only parses URLs or known provider hosts with requireUrl', () => {
    expect(parseS3EndpointUrl('backups/2024', { requireUrl: true })).toBeNull();
    expect(parseS3EndpointUrl('bkt.ams3.digitaloceanspaces.com', { requireUrl: true })).toEqual({
      server: 'ams3.digitaloceanspaces.com',
      bucket: 'bkt',
    });
  });
});

describe('applyPastedS3Endpoint', () => {
  it('fills server, bucket, folder and TLS from a pasted URL', () => {
    const form = emptyForm();
    form.custom['path'] = 'old';

    expect(applyPastedS3Endpoint('https://bkt.ams3.digitaloceanspaces.com/new/folder', form)).toBe(true);
    expect(form.dynamic['s3-server-name']).toBe('ams3.digitaloceanspaces.com');
    expect(form.dynamic['use-ssl']).toBe('true');
    expect(form.custom['bucket']).toBe('bkt');
    expect(form.custom['path']).toBe('new/folder');
  });

  it('keeps the folder when the URL has none', () => {
    const form = emptyForm();
    form.custom['path'] = 'keep';
    applyPastedS3Endpoint('https://bkt.ams3.digitaloceanspaces.com', form);
    expect(form.custom['path']).toBe('keep');
  });

  it('applies the chunk encoding default for the pasted provider', () => {
    const form = emptyForm();
    applyPastedS3Endpoint('https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/bkt', form);
    expect(form.dynamic[S3_DISABLE_CHUNK_ENCODING_OPTION]).toBe('true');
  });

  it('leaves the form alone when the text is not an endpoint', () => {
    const form = emptyForm();
    expect(applyPastedS3Endpoint('minio.example.com', form)).toBe(false);
    expect(form).toEqual(emptyForm());
  });

  it('requires a bucket when pasting into the bucket field', () => {
    const form = emptyForm();
    expect(applyPastedS3Endpoint('https://s3.wasabisys.com', form, { requireBucket: true })).toBe(false);
    expect(applyPastedS3Endpoint('my-bucket', form, { requireBucket: true })).toBe(false);
    expect(form).toEqual(emptyForm());

    expect(applyPastedS3Endpoint('https://s3.wasabisys.com/bkt', form, { requireBucket: true })).toBe(true);
    expect(form.custom['bucket']).toBe('bkt');
  });
});
