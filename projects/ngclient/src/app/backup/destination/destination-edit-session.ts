import {
  DestinationFormValues,
  fromTargetPath,
  getConfigurationByUrl,
  toTargetPath,
} from './destination.config-utilities';

export function copyDestinationForm(form: DestinationFormValues): DestinationFormValues {
  return { custom: { ...form.custom }, dynamic: { ...form.dynamic }, advanced: { ...form.advanced } };
}

// RFC 3986 semantics: a "#" starts the fragment, which is carried over untouched.
// Values the editor writes are percent-encoded, so an edited value never contains a raw "#".
function splitUrl(url: string) {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = withoutFragment.indexOf('?');
  return {
    base: queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex),
    query: queryIndex === -1 ? '' : withoutFragment.slice(queryIndex + 1),
    hasQuery: queryIndex !== -1,
    fragment,
  };
}

function splitBase(base: string) {
  const match = /^([^:]+:\/\/)([^/]*)(.*)$/.exec(base);
  return match ? { protocol: match[1], authority: match[2], path: match[3] } : null;
}

function splitAuthority(authority: string) {
  const at = authority.lastIndexOf('@');
  const credentials = at === -1 ? '' : authority.slice(0, at + 1);
  const hostPort = authority.slice(at + 1);
  const match = /^(.*?)(:\d+)?$/.exec(hostPort)!;
  return { credentials, host: match[1], port: match[2] ?? '' };
}

function mergeBase(original: string, before: string, after: string) {
  if (before === after) return original;
  const old = splitBase(before);
  const next = splitBase(after);
  const saved = splitBase(original);
  // Legacy file paths can place the drive in the authority instead of the path.
  // Once that path is edited, use the mapper's representation of the new path.
  if (!old || !next || !saved || !!old.authority !== !!saved.authority) return after;
  const oldAuthority = splitAuthority(old.authority);
  const nextAuthority = splitAuthority(next.authority);
  const savedAuthority = splitAuthority(saved.authority);
  const authority = (Object.keys(oldAuthority) as (keyof typeof oldAuthority)[])
    .map((key) => (oldAuthority[key] === nextAuthority[key] ? savedAuthority[key] : nextAuthority[key]))
    .join('');
  return (
    (old.protocol === next.protocol ? saved.protocol : next.protocol) +
    authority +
    (old.path === next.path ? saved.path : next.path)
  );
}

/** Apply only mapper-visible changes; keep untouched URL tokens exactly as saved. */
export function mergeDestinationUrlEdits(original: string, before: string, after: string): string {
  const saved = splitUrl(original);
  const old = splitUrl(before);
  const next = splitUrl(after);
  const oldParams = new URLSearchParams(old.query);
  const nextParams = new URLSearchParams(next.query);
  const keys = new Set([...oldParams.keys(), ...nextParams.keys()]);
  const changed = new Set(
    [...keys].filter((key) => JSON.stringify(oldParams.getAll(key)) !== JSON.stringify(nextParams.getAll(key)))
  );
  const keyOf = (token: string) => new URLSearchParams(token).keys().next().value;
  const tokens = saved.query ? saved.query.split('&') : [];
  const replacement = next.query ? next.query.split('&') : [];
  const inserted = new Set<string>();
  const merged = tokens.flatMap((token) => {
    const key = keyOf(token);
    if (key === undefined || !changed.has(key)) return [token];
    if (inserted.has(key)) return [];
    inserted.add(key);
    return replacement.filter((value) => keyOf(value) === key);
  });
  for (const key of changed) {
    if (!inserted.has(key)) merged.push(...replacement.filter((value) => keyOf(value) === key));
  }
  const query = merged.join('&');
  const keepEmptyQuery = saved.hasQuery && !saved.query && changed.size === 0;
  let base = mergeBase(saved.base, old.base, next.base);
  const savedBase = splitBase(saved.base);
  const oldBase = splitBase(old.base);
  // An explicit SSL edit must override a legacy suffix such as webdavs://.
  if (
    changed.has('use-ssl') &&
    savedBase &&
    oldBase &&
    savedBase.protocol === oldBase.protocol.replace('://', 's://')
  ) {
    base = oldBase.protocol + base.slice(savedBase.protocol.length);
  }
  // The form never shows credentials embedded in the authority, so an explicit
  // credential edit must not leave the stale ones in place next to the new option.
  if (changed.has('auth-username') || changed.has('auth-password')) {
    const parts = splitBase(base);
    if (parts) {
      const { host, port } = splitAuthority(parts.authority);
      base = parts.protocol + host + port + parts.path;
    }
  }
  return base + (query || keepEmptyQuery ? '?' + query : '') + saved.fragment;
}

/** Reading the editor never writes its URL. Only commit() applies explicit edits. */
export class DestinationEditSession {
  url: string | null | undefined;
  /** Mapper output for the values currently shown; null when the URL could not be parsed. */
  #before: string | null = null;
  #destinationType = '';

  /** False when the loaded URL cannot be represented by the form, so edits cannot be applied. */
  get canEdit() {
    return this.#before !== null;
  }

  load(url: string | null): DestinationFormValues {
    this.url = url;
    this.#before = null;
    const empty = { custom: {}, dynamic: {}, advanced: {} };
    if (!url) return empty;
    const config = getConfigurationByUrl(url);
    this.#destinationType = config.customKey ?? config.key;
    try {
      const parsed = fromTargetPath(url);
      const form = parsed
        ? { custom: parsed.custom ?? {}, dynamic: parsed.dynamic ?? {}, advanced: parsed.advanced ?? {} }
        : /^[^:]+:\/\/$/.test(url)
          ? empty
          : null;
      if (form) {
        this.#before = toTargetPath({ destinationType: this.#destinationType, ...copyDestinationForm(form) });
        return copyDestinationForm(form);
      }
    } catch {
      // Keep an unparseable URL intact; it can still be corrected in the raw URL editor.
    }
    return empty;
  }

  commit(form: DestinationFormValues): string | null {
    if (!this.url || this.#before === null) return null;
    try {
      const after = toTargetPath({ destinationType: this.#destinationType, ...copyDestinationForm(form) });
      if (!after) return null;
      const url = mergeDestinationUrlEdits(this.url, this.#before, after);
      this.url = url;
      this.#before = after;
      return url;
    } catch {
      // A broken mapper must not replace the last valid connection string.
      return null;
    }
  }
}
