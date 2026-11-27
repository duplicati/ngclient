import { getBackendType } from '../backup/destination/destination.config-utilities';

/** Names a destination by its type and, when the URL has one, its host and path; never the query, which holds the options */
export function secondaryDestinationName(target: string | null | undefined): string {
  if (!target) return '';
  const type = getBackendType(target) || target.split('://')[0];
  let location = '';
  try {
    const url = new URL(target);
    location = decodeURIComponent(`${url.host}${url.pathname}`).replace(/\/+$/, '');
  } catch {}

  return location ? `${type} — ${location}` : type;
}
