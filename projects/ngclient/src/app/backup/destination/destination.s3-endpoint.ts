/**
 * Parsing of S3 endpoint URLs copied from a provider's dashboard, so a pasted
 * URL can be split into the server name, bucket and folder the S3 form expects.
 *
 * Providers show endpoints in two styles:
 * - path style:          https://s3.eu-central-1.wasabisys.com/my-bucket/folder
 * - virtual-hosted style: https://my-bucket.ams3.digitaloceanspaces.com/folder
 *
 * Path style is unambiguous for any host. Virtual-hosted style can only be split
 * when the provider's service hostname is known, so the patterns below list the
 * service hostname of each provider that hands out bucket URLs.
 */

/** The parts of an S3 endpoint URL that map to fields in the S3 destination form. */
export type S3EndpointParts = {
  /** Host (and port, if any) to use as `s3-server-name`. */
  server: string;
  bucket?: string;
  path?: string;
  /** Set when the pasted text carried an http/https scheme. */
  useSsl?: boolean;
};

type ServiceHostPattern = {
  /** Matches the service hostname only, without any bucket prefix. */
  pattern: string;
  /** Turns a matched service hostname into the server name the backend should use. */
  normalize?: (host: string) => string;
};

const REGION = '[a-z0-9-]+';

/** Service hostnames of providers whose bucket URLs can be virtual-hosted style. */
const S3_SERVICE_HOSTS: readonly ServiceHostPattern[] = [
  // Amazon: s3.amazonaws.com, s3.eu-west-1.amazonaws.com, legacy s3-eu-west-1.amazonaws.com
  { pattern: `s3(?:[.-]${REGION})?\\.amazonaws\\.com` },
  { pattern: `s3(?:\\.${REGION})?\\.wasabisys\\.com` },
  { pattern: `s3\\.${REGION}\\.backblazeb2\\.com` },
  // DigitalOcean: the CDN hostname serves the same bucket, but uploads go to the origin
  {
    pattern: `${REGION}(?:\\.cdn)?\\.digitaloceanspaces\\.com`,
    normalize: (host) => host.replace('.cdn.digitaloceanspaces.com', '.digitaloceanspaces.com'),
  },
  { pattern: `${REGION}\\.linodeobjects\\.com` },
  { pattern: `${REGION}\\.your-objectstorage\\.com` },
  { pattern: `s3\\.${REGION}(?:\\.io)?\\.cloud\\.ovh\\.net` },
  { pattern: `s3\\.${REGION}\\.scw\\.cloud` },
  { pattern: `s3\\.${REGION}\\.ionoscloud\\.com` },
  { pattern: `sos-${REGION}\\.exo\\.io` },
  // Cloudflare R2: the account ID is 32 hex characters, optionally with a jurisdiction (eu, fedramp)
  { pattern: `[0-9a-f]{32}(?:\\.[a-z]+)?\\.r2\\.cloudflarestorage\\.com` },
  { pattern: `s3\\.${REGION}\\.lyvecloud\\.seagate\\.com` },
  { pattern: `${REGION}\\.s3\\.synologyc2\\.net` },
  { pattern: `s3\\.(?:private\\.|direct\\.)?${REGION}\\.cloud-object-storage\\.appdomain\\.cloud` },
  { pattern: `cos\\.${REGION}\\.myqcloud\\.com` },
  { pattern: `obs\\.${REGION}\\.myhuaweicloud\\.com` },
  { pattern: `oss-${REGION}\\.aliyuncs\\.com` },
];

const SERVICE_HOST_REGEXES = S3_SERVICE_HOSTS.map((x) => ({
  ...x,
  exact: new RegExp(`^(?:${x.pattern})$`),
  // Lazy bucket match: take the shortest prefix that leaves a valid service host, so
  // "b.ams3.cdn.digitaloceanspaces.com" is bucket "b", not bucket "b.ams3" in region "cdn".
  withBucket: new RegExp(`^(.+?)\\.(${x.pattern})$`),
}));

/** Splits a hostname into bucket and service host, if it is a known virtual-hosted bucket URL. */
function splitVirtualHost(host: string): { server: string; bucket?: string } | null {
  for (const entry of SERVICE_HOST_REGEXES) {
    const normalize = entry.normalize ?? ((h: string) => h);
    if (entry.exact.test(host)) return { server: normalize(host) };

    const match = entry.withBucket.exec(host);
    if (match) return { server: normalize(match[2]), bucket: match[1] };
  }
  return null;
}

/**
 * Parses text pasted into the S3 form into server, bucket and folder.
 *
 * Returns `null` when the text does not look like an endpoint URL, so the caller
 * can let the paste through unchanged. With `requireUrl`, plain text is only
 * parsed when it has a scheme or a known provider hostname; this keeps a pasted
 * bucket name like `backups/2024` from being read as a host and path.
 */
export function parseS3EndpointUrl(text: string, options?: { requireUrl?: boolean }): S3EndpointParts | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed);
  const scheme = schemeMatch?.[1].toLowerCase();
  // Only web endpoints are handled; s3:// and other URI schemes mean something else to Duplicati.
  if (scheme && scheme !== 'http' && scheme !== 'https') return null;

  const rest = schemeMatch ? trimmed.slice(schemeMatch[0].length) : trimmed;
  const withoutQuery = rest.split(/[?#]/)[0];
  const slashIndex = withoutQuery.indexOf('/');
  const authority = (slashIndex < 0 ? withoutQuery : withoutQuery.slice(0, slashIndex)).toLowerCase();
  const pathPart = slashIndex < 0 ? '' : withoutQuery.slice(slashIndex + 1);

  // Credentials in the URL are not supported; leave such text alone.
  if (!authority || authority.includes('@')) return null;

  const [hostname, port] = authority.split(':');
  if (!/^[a-z0-9.-]+$/.test(hostname) || (port !== undefined && !/^\d+$/.test(port))) return null;

  const virtual = splitVirtualHost(hostname);
  if (!scheme && !virtual && (options?.requireUrl || !pathPart)) return null;

  const segments = pathPart
    .split('/')
    .filter((x) => x.length > 0)
    .map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    });

  const server = (virtual?.server ?? hostname) + (port !== undefined ? `:${port}` : '');
  let bucket = virtual?.bucket;
  if (!bucket && segments.length > 0) bucket = segments.shift();

  const result: S3EndpointParts = { server };
  if (bucket) result.bucket = bucket;
  if (segments.length > 0) result.path = segments.join('/');
  if (scheme) result.useSsl = scheme === 'https';
  return result;
}
