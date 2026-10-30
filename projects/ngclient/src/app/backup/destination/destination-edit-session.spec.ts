import { afterEach, describe, expect, it, vi } from 'vitest';
import { DestinationEditSession, mergeDestinationUrlEdits } from './destination-edit-session';
import { getConfigurationByUrl } from './destination.config-utilities';

describe('DestinationEditSession', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    'file://C:/Backup%20Files?future=a+b&future=two&flag',
    'ssh://Example.COM:22/archive%2fpart?auth-password=p%2525&unknown=a+b',
    'webdavs://Example.COM/archive?auth-password=********&unknown=value',
    's3://BucketName/archive?s3-server-name=s3.example.test&auth-password=********&future=1',
    'pcloud://api.pcloud.com/Folder?authid=********&future=a+b',
    'custom-backend://example/archive?future=a+b&future=two',
  ])('preserves the saved URL when loaded without edits: %s', (url) => {
    const session = new DestinationEditSession();
    const form = session.load(url);
    expect(session.url).toBe(url);
    expect(session.commit(form)).toBe(url);
  });

  it('accumulates successive edits without normalizing untouched query tokens', () => {
    const session = new DestinationEditSession();
    const form = session.load('ssh://Example.COM/path?auth-password=p%2525&unknown=a+b&unknown=two&flag');
    form.advanced['retry-count'] = '8';
    expect(session.commit(form)).toBe(
      'ssh://Example.COM/path?auth-password=p%2525&unknown=a+b&unknown=two&flag&retry-count=8'
    );
    form.custom['path'] = 'new path';
    expect(session.commit(form)).toBe(
      'ssh://Example.COM/new%20path?auth-password=p%2525&unknown=a+b&unknown=two&flag&retry-count=8'
    );
    delete form.advanced['retry-count'];
    expect(session.commit(form)).toBe('ssh://Example.COM/new%20path?auth-password=p%2525&unknown=a+b&unknown=two&flag');
  });

  it('does not let edits to the displayed form mutate the baseline', () => {
    const session = new DestinationEditSession();
    const form = session.load('ssh://example/path?auth-password=old');
    form.dynamic['auth-password'] = 'new secret';
    expect(session.commit(form)).toBe('ssh://example/path?auth-password=new%20secret');
  });

  it('allows SSL to be disabled explicitly for a legacy SSL URL', () => {
    const session = new DestinationEditSession();
    const form = session.load('webdavs://Example.COM/path?future=a+b');
    form.dynamic['use-ssl'] = 'false';
    expect(session.commit(form)).toBe('webdav://Example.COM/path?future=a+b&use-ssl=false');
  });

  it('starts with fresh values when a different destination is loaded', () => {
    const session = new DestinationEditSession();
    session.load('ssh://example/path?auth-password=secret');
    const form = session.load('s3://');
    expect(form).toEqual({ custom: {}, dynamic: {}, advanced: {} });
    form.custom['bucket'] = 'new-bucket';
    expect(session.commit(form)).toBe('s3://new-bucket');
  });

  it('keeps unparseable URLs intact even if a stale editor attempts to commit', () => {
    const session = new DestinationEditSession();
    session.load('ssh://example/path?auth-password=secret');
    expect(session.canEdit).toBe(true);
    const form = session.load('ssh://undefined/path');
    expect(session.canEdit).toBe(false);
    expect(form).toEqual({ custom: {}, dynamic: {}, advanced: {} });
    form.custom['path'] = 'changed';
    expect(session.commit(form)).toBeNull();
    expect(session.url).toBe('ssh://undefined/path');
  });

  it('treats a raw # as the start of a fragment and carries the fragment over untouched', () => {
    const session = new DestinationEditSession();
    const url = 'ssh://example/path?auth-password=p#frag&not=query';
    const form = session.load(url);
    expect(form.dynamic['auth-password']).toBe('p');
    expect(session.commit(form)).toBe(url);
    form.dynamic['auth-password'] = 'new#1';
    expect(session.commit(form)).toBe('ssh://example/path?auth-password=new%231#frag&not=query');
  });

  it('drops credentials embedded in the authority when the credential fields are edited', () => {
    const session = new DestinationEditSession();
    const form = session.load('ssh://user:old@Example.COM:022/path?future=a+b');
    form.custom['path'] = 'other';
    expect(session.commit(form)).toBe('ssh://user:old@Example.COM:022/other?future=a+b');
    form.dynamic['auth-password'] = 'new';
    expect(session.commit(form)).toBe('ssh://Example.COM:022/other?future=a+b&auth-password=new');
  });

  it('keeps the saved URL when the mapper fails during an explicit edit', () => {
    const session = new DestinationEditSession();
    const url = 'ssh://example/path?unknown=value';
    const form = session.load(url);
    vi.spyOn(getConfigurationByUrl(url).mapper, 'to').mockImplementation(() => {
      throw new Error('broken mapper');
    });
    form.custom['path'] = 'changed';
    expect(session.commit(form)).toBeNull();
    expect(session.url).toBe(url);
  });
});

describe('mergeDestinationUrlEdits', () => {
  it('replaces or removes only edited keys, including repeated and encoded keys', () => {
    expect(
      mergeDestinationUrlEdits(
        'ssh://EXAMPLE/path?%61=old&a=older&future=a+b&empty&remove=x',
        'ssh://EXAMPLE/path?a=older&future=a%20b&empty=&remove=x',
        'ssh://EXAMPLE/path?a=new&future=a%20b&empty='
      )
    ).toBe('ssh://EXAMPLE/path?a=new&future=a+b&empty');
  });
  it('keeps the saved port, credentials and encoded path when only the server changes', () => {
    expect(
      mergeDestinationUrlEdits(
        'ssh://user:password@OLD:022/path%2fpart?future=a+b',
        'ssh://OLD:22/path/part?future=a%20b',
        'ssh://NEW:22/path/part?future=a%20b'
      )
    ).toBe('ssh://user:password@NEW:022/path%2fpart?future=a+b');
  });
  it('uses the new path representation when editing a legacy file URL', () => {
    expect(
      mergeDestinationUrlEdits(
        'file://C:/old?future=a+b',
        'file:///C%3A/old?future=a%20b',
        'file:///C%3A/new?future=a%20b'
      )
    ).toBe('file:///C%3A/new?future=a+b');
  });
});
