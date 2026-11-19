import {
  POSTGRESQL_DATABASE_OPTION,
  POSTGRESQL_HOST_OPTION,
  POSTGRESQL_INCLUDE_LARGE_OBJECTS_OPTION,
  POSTGRESQL_PORT_OPTION,
  POSTGRESQL_SCHEME,
  POSTGRESQL_USERNAME_OPTION,
} from '../../backup/destination/destination.postgresql';

/** The source type the server marks the root of a PostgreSQL backup with */
export const POSTGRESQL_EXTENDED_DATA_TYPE = POSTGRESQL_SCHEME;

/** The key of the module that restores to a PostgreSQL database */
export const POSTGRESQL_RESTORE_MODULE_KEY = POSTGRESQL_SCHEME;

const POSTGRESQL_URL_PREFIX = `${POSTGRESQL_SCHEME}://`;

/** The option that selects what a restore does to the database, and its value for loading rows only */
export const POSTGRESQL_RESTORE_MODE_OPTION = 'postgresql-restore-mode';
export const POSTGRESQL_RESTORE_MODE_TABLES = 'tables';
/** The option that creates a restored table that is missing, when only rows are loaded */
export const POSTGRESQL_RESTORE_CREATE_TABLES_OPTION = 'postgresql-restore-create-tables';
/** The option that allows a whole database restore of a version where tables come from different dumps */
export const POSTGRESQL_RESTORE_ALLOW_MIXED_VERSIONS_OPTION = 'postgresql-restore-allow-mixed-versions';

/** The entry of a backup that holds the table of contents of the database */
const POSTGRESQL_TABLE_OF_CONTENTS_ENTRY = 'toc';

/** How a restore to a database is done */
export type PostgresqlRestoreChoices = {
  /** Only the rows of the restored tables are loaded, into tables that exist */
  tablesOnly: boolean;
  /** A restored table that is missing is created first; only used when loading rows only */
  createTables: boolean;
  /** A whole database is restored although its tables come from different dumps */
  allowMixedVersions: boolean;
};

/** The database a restore writes to, as shown before the restore starts */
export type PostgresqlTarget = {
  host: string;
  port: string;
  database: string;
  username: string;
};

/** Whether the entry of a backup's sources is a PostgreSQL database, as in `@/mount|postgresql://?…` */
export function isPostgresqlSourceEntry(source: string): boolean {
  return source.startsWith('@') && source.includes(`|${POSTGRESQL_URL_PREFIX}`);
}

/** The options of a source that only a backup uses; a restore takes what the backup holds */
const SOURCE_ONLY_OPTIONS = [POSTGRESQL_INCLUDE_LARGE_OBJECTS_OPTION];

/**
 * The URL of a database as a restore target, from the URL it has as a source: the same connection,
 * without the options only a backup uses. The other options are kept exactly as they are written.
 * A URL that is not a PostgreSQL URL is returned unchanged.
 */
export function postgresqlTargetUrlFromSource<T extends string | null>(url: T): T {
  if (!url || !url.startsWith(POSTGRESQL_URL_PREFIX)) return url;

  const queryStart = url.indexOf('?');
  if (queryStart < 0) return url;

  const kept = url
    .substring(queryStart + 1)
    .split('&')
    .filter((option) => !SOURCE_ONLY_OPTIONS.includes(option.split('=')[0]));

  return (url.substring(0, queryStart + 1) + kept.join('&')) as T;
}

/** Reads the database a PostgreSQL URL points at, or null if the text is not such a URL */
export function parsePostgresqlTarget(url: string | null | undefined): PostgresqlTarget | null {
  if (!url || !url.startsWith(POSTGRESQL_URL_PREFIX)) return null;

  const queryStart = url.indexOf('?');
  const options = new URLSearchParams(queryStart < 0 ? '' : url.substring(queryStart + 1));
  const option = (name: string) => options.get(name)?.trim() ?? '';

  return {
    host: option(POSTGRESQL_HOST_OPTION),
    port: option(POSTGRESQL_PORT_OPTION),
    database: option(POSTGRESQL_DATABASE_OPTION),
    username: option(POSTGRESQL_USERNAME_OPTION),
  };
}

/** The folder a backup holds the database in, with the separator its paths use, from the entry `@/mount|postgresql://…` */
function databaseRoot(sourcePrefix: string, selectedPaths: string[]): string {
  const mount = sourcePrefix.startsWith('@') ? sourcePrefix.substring(1) : sourcePrefix;
  const sample = selectedPaths.find((x) => x.includes('/') || x.includes('\\')) ?? mount;
  const separator = sample.includes('/') ? '/' : '\\';

  return mount.endsWith(separator) ? mount : mount + separator;
}

/**
 * Whether the selection covers the whole database. Restoring without a selection restores everything,
 * and so does selecting the folder of the database.
 */
export function isWholeDatabaseSelected(selectedPaths: string[], sourcePrefix: string | null | undefined): boolean {
  if (selectedPaths.length === 0) return true;
  if (!sourcePrefix) return false;

  const root = databaseRoot(sourcePrefix, selectedPaths);
  return selectedPaths.some((x) => x === root || x === root.substring(0, root.length - 1));
}

/**
 * The path of the table of contents of the database. A restore of single tables takes the columns and the
 * encoding of the rows from it, and creates missing tables from it, so it is restored along with them.
 */
export function postgresqlTableOfContentsPath(selectedPaths: string[], sourcePrefix: string): string {
  return databaseRoot(sourcePrefix, selectedPaths) + POSTGRESQL_TABLE_OF_CONTENTS_ENTRY;
}

/**
 * Builds the restore path that makes the server restore to a PostgreSQL database. A database has no
 * folders to pick, so the path is the URL of the database itself, with how the restore is done.
 */
export function buildPostgresqlRestorePath(
  url: string | null | undefined,
  choices: PostgresqlRestoreChoices
): { path: string } | { error: 'missing-target' | 'incomplete-target' } {
  const target = parsePostgresqlTarget(url);
  if (!target) return { error: 'missing-target' };
  if (!target.host || !target.database || !target.username) return { error: 'incomplete-target' };

  // A value in the URL wins over the same option given to the restore
  const options: [string, string][] = [];
  if (choices.tablesOnly) {
    options.push([POSTGRESQL_RESTORE_MODE_OPTION, POSTGRESQL_RESTORE_MODE_TABLES]);
    if (choices.createTables) options.push([POSTGRESQL_RESTORE_CREATE_TABLES_OPTION, 'true']);
  } else if (choices.allowMixedVersions) {
    options.push([POSTGRESQL_RESTORE_ALLOW_MIXED_VERSIONS_OPTION, 'true']);
  }

  const separator = url!.includes('?') ? '&' : '?';
  const suffix = options.map(([name, value]) => `${name}=${value}`).join('&');

  return { path: `@${url}${suffix ? separator + suffix : ''}` };
}
