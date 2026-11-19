import {
  POSTGRESQL_DATABASE_OPTION,
  POSTGRESQL_HOST_OPTION,
  POSTGRESQL_PORT_OPTION,
  POSTGRESQL_SCHEME,
  POSTGRESQL_USERNAME_OPTION,
} from '../../backup/destination/destination.postgresql';

/** The source type the server marks the root of a PostgreSQL backup with */
export const POSTGRESQL_EXTENDED_DATA_TYPE = POSTGRESQL_SCHEME;

/** The key of the module that restores to a PostgreSQL database */
export const POSTGRESQL_RESTORE_MODULE_KEY = POSTGRESQL_SCHEME;

const POSTGRESQL_URL_PREFIX = `${POSTGRESQL_SCHEME}://`;

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

/**
 * Builds the restore path that makes the server restore to a PostgreSQL database. A database has no
 * folders to pick, so the path is the URL of the database itself.
 */
export function buildPostgresqlRestorePath(
  url: string | null | undefined
): { path: string } | { error: 'missing-target' | 'incomplete-target' } {
  const target = parsePostgresqlTarget(url);
  if (!target) return { error: 'missing-target' };
  if (!target.host || !target.database || !target.username) return { error: 'incomplete-target' };

  return { path: `@${url}` };
}
