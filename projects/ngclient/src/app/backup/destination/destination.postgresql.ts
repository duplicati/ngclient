/**
 * The names that make up the source URL of a PostgreSQL backup. The URL has no host part; everything is a
 * named query option, for example `postgresql://?postgresql-host=db.example.com&postgresql-database=app`.
 * The Duplicati source provider reads the same names.
 */
export const POSTGRESQL_SCHEME = 'postgresql';

export const POSTGRESQL_HOST_OPTION = 'postgresql-host';
export const POSTGRESQL_PORT_OPTION = 'postgresql-port';
export const POSTGRESQL_DATABASE_OPTION = 'postgresql-database';
export const POSTGRESQL_USERNAME_OPTION = 'postgresql-username';
export const POSTGRESQL_PASSWORD_OPTION = 'postgresql-password';
export const POSTGRESQL_SSLMODE_OPTION = 'postgresql-sslmode';
export const POSTGRESQL_SSLROOTCERT_OPTION = 'postgresql-sslrootcert';
export const POSTGRESQL_CLIENT_PATH_OPTION = 'postgresql-client-path';

export const POSTGRESQL_DEFAULT_PORT = 5432;
export const POSTGRESQL_DEFAULT_SSLMODE = 'require';

/** The options shown as fields of their own, in the order they are shown and written to the URL. */
export const POSTGRESQL_CONNECTION_OPTIONS = [
  POSTGRESQL_HOST_OPTION,
  POSTGRESQL_PORT_OPTION,
  POSTGRESQL_DATABASE_OPTION,
  POSTGRESQL_USERNAME_OPTION,
  POSTGRESQL_PASSWORD_OPTION,
  POSTGRESQL_SSLMODE_OPTION,
];

/** The other scheme a connection string can have, as hosting platforms hand it out. */
export const POSTGRESQL_CONNECTION_STRING_ALIAS_SCHEME = 'postgres';

/** The parameters libpq reads from the query of a connection string. */
const LIBPQ_HOST = 'host';
const LIBPQ_PORT = 'port';
const LIBPQ_DATABASE = 'dbname';
const LIBPQ_USER = 'user';
const LIBPQ_PASSWORD = 'password';
const LIBPQ_SSLMODE = 'sslmode';

type ConnectionStringUrl = {
  hostname: string;
  exactHostname: string;
  port: string;
  pathname: string;
  username: string;
  password: string;
  searchParams: URLSearchParams;
};

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Whether the URL is a connection string such as `postgres://user:pass@host:5432/db?sslmode=require`,
 * which has a host part or the other scheme. The source URL itself has only named options.
 */
export function isPostgresqlConnectionString(url: { protocol: string; hostname: string }): boolean {
  return (
    url.protocol === `${POSTGRESQL_CONNECTION_STRING_ALIAS_SCHEME}:` ||
    (url.protocol === `${POSTGRESQL_SCHEME}:` && url.hostname !== '')
  );
}

/**
 * Converts the parts of a pasted connection string to the named options of the source URL. Parameters
 * the source has no option for are left out.
 */
export function postgresqlConnectionStringToOptions(url: ConnectionStringUrl): Record<string, string> {
  const query = (name: string) => url.searchParams.get(name) ?? '';

  const options: Record<string, string> = {
    // An IPv6 address is bracketed in a URL, but not as a host name
    [POSTGRESQL_HOST_OPTION]:
      decode(url.exactHostname || url.hostname).replace(/^\[(.*)\]$/, '$1') || query(LIBPQ_HOST),
    [POSTGRESQL_PORT_OPTION]: url.port || query(LIBPQ_PORT) || String(POSTGRESQL_DEFAULT_PORT),
    [POSTGRESQL_DATABASE_OPTION]: decode(url.pathname.replace(/^\//, '')) || query(LIBPQ_DATABASE),
    [POSTGRESQL_USERNAME_OPTION]: decode(url.username) || query(LIBPQ_USER),
    [POSTGRESQL_PASSWORD_OPTION]: decode(url.password) || query(LIBPQ_PASSWORD),
    [POSTGRESQL_SSLMODE_OPTION]: query(LIBPQ_SSLMODE).toLowerCase() || POSTGRESQL_DEFAULT_SSLMODE,
  };

  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== ''));
}

/**
 * The options in the order they are written to the source URL: the connection options first, then the
 * rest by name, so the same options always give the same URL. Options without a value are left out.
 */
export function postgresqlOptionsInUrlOrder(options: Record<string, unknown>): [string, unknown][] {
  const position = (name: string) => {
    const index = POSTGRESQL_CONNECTION_OPTIONS.indexOf(name);
    return index < 0 ? POSTGRESQL_CONNECTION_OPTIONS.length : index;
  };

  return Object.entries(options)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .sort(([a], [b]) => position(a) - position(b) || a.localeCompare(b));
}

/** The source URL a new source starts with. */
export const POSTGRESQL_DEFAULT_SOURCE_URL = `${POSTGRESQL_SCHEME}://?${POSTGRESQL_PORT_OPTION}=${POSTGRESQL_DEFAULT_PORT}&${POSTGRESQL_SSLMODE_OPTION}=${POSTGRESQL_DEFAULT_SSLMODE}`;
