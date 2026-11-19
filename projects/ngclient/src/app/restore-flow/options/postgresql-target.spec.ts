import { describe, expect, it } from 'vitest';
import { buildPostgresqlRestorePath, isPostgresqlSourceEntry, parsePostgresqlTarget } from './postgresql-target';

const URL =
  'postgresql://?postgresql-host=db.example.com&postgresql-port=6543&postgresql-database=app' +
  '&postgresql-username=restore&postgresql-password=p%40ss';

describe('PostgreSQL restore target', () => {
  it('recognises a PostgreSQL source of a backup', () => {
    expect(isPostgresqlSourceEntry(`@/backup|${URL}`)).toBe(true);
    expect(isPostgresqlSourceEntry('@/source|office365://?office365-tenant-id=t')).toBe(false);
    expect(isPostgresqlSourceEntry('/var/lib/postgresql://')).toBe(false);
  });

  it('reads the database a URL points at', () => {
    expect(parsePostgresqlTarget(URL)).toEqual({
      host: 'db.example.com',
      port: '6543',
      database: 'app',
      username: 'restore',
    });
    expect(parsePostgresqlTarget('postgresql://')).toEqual({ host: '', port: '', database: '', username: '' });
    expect(parsePostgresqlTarget('office365://?postgresql-host=x')).toBeNull();
    expect(parsePostgresqlTarget(null)).toBeNull();
  });

  it('uses the URL of the database as the restore path', () => {
    expect(buildPostgresqlRestorePath(URL)).toEqual({ path: `@${URL}` });
  });

  it('refuses a missing or incomplete database', () => {
    expect(buildPostgresqlRestorePath(null)).toEqual({ error: 'missing-target' });
    expect(buildPostgresqlRestorePath('googleworkspace://')).toEqual({ error: 'missing-target' });
    expect(buildPostgresqlRestorePath('postgresql://?postgresql-host=db.example.com&postgresql-database=app')).toEqual({
      error: 'incomplete-target',
    });
    expect(buildPostgresqlRestorePath('postgresql://?postgresql-port=5432&postgresql-sslmode=require')).toEqual({
      error: 'incomplete-target',
    });
  });
});
