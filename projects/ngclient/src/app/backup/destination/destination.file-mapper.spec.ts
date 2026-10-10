import { describe, expect, it } from 'vitest';
import {
  fromTargetPath,
  getConfigurationByKey,
  type ValueOfDestinationFormGroup,
} from './destination.config-utilities';

const file = getConfigurationByKey('file');

function fields(path: string, advanced: Record<string, string> = {}): ValueOfDestinationFormGroup {
  return { destinationType: 'file', custom: { path }, dynamic: {}, advanced };
}

describe('file destination path round-trip', () => {
  it.each(['/backups?archive', '/backups?/daily?copy', '/backups/question? & hash# 日本語'])(
    'preserves question marks in the Unix path %s',
    (path) => {
      const targetUrl = file.mapper.to(fields(path));
      const parsed = fromTargetPath(targetUrl);

      expect(parsed?.custom.path).toBe(path);
      expect(file.mapper.to(parsed!)).toBe(targetUrl);
    }
  );

  it('separates URL options before decoding a question mark in the path', () => {
    const targetUrl = file.mapper.to(fields('/backups?archive', { 'disable-auto-create-folder': 'true' }));
    const parsed = fromTargetPath(targetUrl);

    expect(parsed?.custom.path).toBe('/backups?archive');
    expect(parsed?.advanced['disable-auto-create-folder']).toBe('true');
    expect(file.mapper.to(parsed!)).toBe(targetUrl);
  });

  it.each(['/backups/daily', '/', '/backups/literal%3Fname', 'C:\\Backups\\Daily', '\\\\server\\share\\backups'])(
    'retains the existing path and URL for %s',
    (path) => {
      const targetUrl = file.mapper.to(fields(path));
      const parsed = fromTargetPath(targetUrl);

      expect(parsed?.custom.path).toBe(path);
      expect(file.mapper.to(parsed!)).toBe(targetUrl);
    }
  );
});
