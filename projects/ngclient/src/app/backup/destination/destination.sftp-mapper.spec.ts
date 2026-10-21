import { describe, expect, it } from 'vitest';
import { fromTargetPath, getConfigurationByKey, UrlLike } from './destination.config-utilities';

describe('SFTP destination editing', () => {
  const mapper = getConfigurationByKey('ssh').mapper;
  const options = {
    'auth-username': 'user name@example',
    'auth-password': 'test+password/=&?',
    'ssh-keyfile': 'C:\\keys\\backup key.pem',
    'ssh-key': 'TEST KEY\nline+two/=',
    'ssh-fingerprint': 'ssh-ed25519 256 ab:cd',
  };
  const query = new URLSearchParams(options).toString();
  it.each(['relative/folder', '/absolute/folder', '日本語/with space'])(
    'preserves %s path semantics and connection options when edited',
    (path) => {
      const original = new UrlLike('ssh://backup.example:2222/' + path + '?' + query);
      const fields = fromTargetPath(original.originalUrl);
      expect(fields).not.toBeNull();
      const saved = new UrlLike(mapper.to(fields!));
      expect(saved.host).toBe(original.host);
      expect(saved.pathname).toBe(original.pathname);
      expect(Object.fromEntries(saved.searchParams)).toEqual(options);
    }
  );
  it('keeps an empty folder and all options while normalizing the trailing slash', () => {
    const fields = fromTargetPath('ssh://backup.example:2222/?' + query)!;
    expect(fields.custom.path).toBe('');
    const saved = new UrlLike(mapper.to(fields));
    expect(saved.host).toBe('backup.example:2222');
    expect(saved.pathname).toBe('');
    expect(Object.fromEntries(saved.searchParams)).toEqual(options);
  });
  it('changes only the folder while preserving authentication and advanced options', () => {
    const fields = fromTargetPath('ssh://backup.example:2222/old?' + query)!;
    fields.custom.path = '/new absolute folder';
    const saved = new UrlLike(mapper.to(fields));
    expect(saved.host).toBe('backup.example:2222');
    expect(saved.pathname).toBe('//new%20absolute%20folder');
    expect(Object.fromEntries(saved.searchParams)).toEqual(options);
  });
});
