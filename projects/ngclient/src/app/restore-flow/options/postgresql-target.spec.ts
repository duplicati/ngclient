import { describe, expect, it } from 'vitest';
import {
  buildPostgresqlRestorePath,
  isPostgresqlSourceEntry,
  isWholeDatabaseSelected,
  parsePostgresqlTarget,
  postgresqlTableOfContentsPath,
  postgresqlTargetUrlFromSource,
  type PostgresqlRestoreChoices,
} from './postgresql-target';

const WHOLE: PostgresqlRestoreChoices = { tablesOnly: false, createTables: false, allowMixedVersions: false };

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
    expect(buildPostgresqlRestorePath(URL, WHOLE)).toEqual({ path: `@${URL}` });
  });

  it('says in the restore path how the restore is done', () => {
    expect(buildPostgresqlRestorePath(URL, { ...WHOLE, allowMixedVersions: true })).toEqual({
      path: `@${URL}&postgresql-restore-allow-mixed-versions=true`,
    });
    expect(buildPostgresqlRestorePath(URL, { tablesOnly: true, createTables: false, allowMixedVersions: true })).toEqual({
      path: `@${URL}&postgresql-restore-mode=tables`,
    });
    expect(buildPostgresqlRestorePath(URL, { tablesOnly: true, createTables: true, allowMixedVersions: false })).toEqual({
      path: `@${URL}&postgresql-restore-mode=tables&postgresql-restore-create-tables=true`,
    });
    // Creating tables only applies when rows are loaded into tables that exist
    expect(buildPostgresqlRestorePath(URL, { ...WHOLE, createTables: true })).toEqual({ path: `@${URL}` });
  });

  it('takes the whole database as selected without a selection or with its folder', () => {
    expect(isWholeDatabaseSelected([], '@/backup')).toBe(true);
    expect(isWholeDatabaseSelected(['/backup/'], '@/backup')).toBe(true);
    expect(isWholeDatabaseSelected(['/backup'], '@/backup')).toBe(true);
    expect(isWholeDatabaseSelected(['\\backup\\'], '@\\backup')).toBe(true);

    expect(isWholeDatabaseSelected(['/backup/tables/'], '@/backup')).toBe(false);
    expect(isWholeDatabaseSelected(['/backup/tables/app.orders', '/backup/toc'], '@/backup')).toBe(false);
    expect(isWholeDatabaseSelected(['/backup/tables/app.orders'], null)).toBe(false);
  });

  it('finds the table of contents next to the tables', () => {
    expect(postgresqlTableOfContentsPath(['/backup/tables/app.orders'], '@/backup')).toBe('/backup/toc');
    expect(postgresqlTableOfContentsPath(['/backup/tables/app.orders'], '@/backup/')).toBe('/backup/toc');
    expect(postgresqlTableOfContentsPath(['\\backup\\tables\\app.orders'], '@\\backup')).toBe('\\backup\\toc');
  });

  it('refuses a missing or incomplete database', () => {
    expect(buildPostgresqlRestorePath(null, WHOLE)).toEqual({ error: 'missing-target' });
    expect(buildPostgresqlRestorePath('googleworkspace://', WHOLE)).toEqual({ error: 'missing-target' });
    expect(
      buildPostgresqlRestorePath('postgresql://?postgresql-host=db.example.com&postgresql-database=app', WHOLE)
    ).toEqual({
      error: 'incomplete-target',
    });
    expect(buildPostgresqlRestorePath('postgresql://?postgresql-port=5432&postgresql-sslmode=require', WHOLE)).toEqual({
      error: 'incomplete-target',
    });
  });

  it('takes the options only a backup uses out of the source URL', () => {
    expect(postgresqlTargetUrlFromSource(`${URL}&postgresql-include-large-objects=true`)).toBe(URL);
    expect(
      postgresqlTargetUrlFromSource(
        'postgresql://?postgresql-include-large-objects=true&postgresql-host=h&postgresql-password=p%40ss%25'
      )
    ).toBe('postgresql://?postgresql-host=h&postgresql-password=p%40ss%25');
    expect(postgresqlTargetUrlFromSource(URL)).toBe(URL);
    expect(postgresqlTargetUrlFromSource('office365://?postgresql-include-large-objects=true')).toBe(
      'office365://?postgresql-include-large-objects=true'
    );
    expect(postgresqlTargetUrlFromSource(null)).toBeNull();
  });
});
