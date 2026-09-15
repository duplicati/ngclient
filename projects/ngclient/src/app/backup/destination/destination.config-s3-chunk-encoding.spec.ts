import { describe, expect, it } from 'vitest';
import {
  applyS3ChunkEncodingDefault,
  S3_DISABLE_CHUNK_ENCODING_OPTION,
  s3HostRequiresDisabledChunkEncoding,
} from './destination.config';
import {
  CustomFormView,
  DestinationFormValues,
  fromTargetPath,
  getConfigurationByKey,
} from './destination.config-utilities';

const emptyForm = (): DestinationFormValues => ({ custom: {}, dynamic: {}, advanced: {} });

describe('S3 chunk encoding defaults', () => {
  describe('s3HostRequiresDisabledChunkEncoding', () => {
    it.each([
      's3.wasabisys.com',
      's3.eu-central-1.wasabisys.com',
      'accountid.r2.cloudflarestorage.com',
      's3.swiss-backup.infomaniak.com',
      's3.pub1.infomaniak.cloud',
      's3-02.polisystems.ch',
      'oss-cn-hangzhou.aliyuncs.com',
      'S3.WASABISYS.COM',
      ' s3.wasabisys.com ',
    ])('flags %s as not supporting chunked uploads', (host) => {
      expect(s3HostRequiresDisabledChunkEncoding(host)).toBe(true);
    });

    it.each([
      's3.amazonaws.com',
      's3.fr-par.scw.cloud',
      'storage.example.com',
      'wasabisys.com.example',
      '',
      null,
      undefined,
    ])('does not flag %s', (host) => {
      expect(s3HostRequiresDisabledChunkEncoding(host)).toBe(false);
    });
  });

  describe('applyS3ChunkEncodingDefault', () => {
    it('sets the option when the server does not support chunked uploads', () => {
      const form = emptyForm();
      applyS3ChunkEncodingDefault('s3.wasabisys.com', form);
      expect(form.advanced[S3_DISABLE_CHUNK_ENCODING_OPTION]).toBe('true');
    });

    it('leaves the form untouched for servers that support chunked uploads', () => {
      const form = emptyForm();
      applyS3ChunkEncodingDefault('s3.amazonaws.com', form);
      expect(form.advanced).toEqual({});
    });

    it('does not override a value the user already configured', () => {
      const form = emptyForm();
      form.advanced[S3_DISABLE_CHUNK_ENCODING_OPTION] = 'false';
      applyS3ChunkEncodingDefault('s3.wasabisys.com', form);
      expect(form.advanced[S3_DISABLE_CHUNK_ENCODING_OPTION]).toBe('false');
    });
  });

  describe('destination configuration', () => {
    const serverField = (key: string) =>
      getConfigurationByKey(key).dynamicFields?.find(
        (field) => typeof field !== 'string' && field.name === 's3-server-name'
      ) as CustomFormView | undefined;

    it.each(['s3', 's3-wasabi', 's3-scaleway'])('%s reacts to server changes', (key) => {
      const form = emptyForm();
      const field = serverField(key);
      expect(field?.onValueChange).toBeTypeOf('function');
      field!.onValueChange!('s3.wasabisys.com', form);
      expect(form.advanced[S3_DISABLE_CHUNK_ENCODING_OPTION]).toBe('true');
    });

    it.each(['s3-wasabi', 's3-polisystems', 's3-infomaniak'])(
      '%s disables chunk encoding on new connections',
      (key) => {
        const url = getConfigurationByKey(key).mapper.default!('');
        expect(url).toBe(`${key}://?use-ssl=true&${S3_DISABLE_CHUNK_ENCODING_OPTION}=true`);
        expect(fromTargetPath(url)?.advanced).toMatchObject({ [S3_DISABLE_CHUNK_ENCODING_OPTION]: 'true' });
      }
    );

    it.each(['s3-aws', 's3-scaleway', 's3-storadera', 's3-ibmcos'])(
      '%s keeps chunk encoding enabled on new connections',
      (key) => {
        const url = getConfigurationByKey(key).mapper.default!('');
        expect(url).toBe(`${key}://?use-ssl=true`);
        expect(fromTargetPath(url)?.advanced ?? {}).not.toHaveProperty(S3_DISABLE_CHUNK_ENCODING_OPTION);
      }
    );
  });
});
