import {
  DestinationFormValues,
  fromTargetPath,
  getConfigurationByUrl,
  toTargetPath,
} from './destination.config-utilities';

export function copyDestinationForm(form: DestinationFormValues): DestinationFormValues {
  return { custom: { ...form.custom }, dynamic: { ...form.dynamic }, advanced: { ...form.advanced } };
}

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
  return base + (query || keepEmptyQuery ? '?' + query : '') + saved.fragment;
}

/** Reading the editor never writes its URL. Only commit() applies explicit edits. */
export class DestinationEditSession {
  url: string | null | undefined;
  #baseline: DestinationFormValues | null = null;
  #destinationType = '';

  load(url: string | null): DestinationFormValues {
    this.url = url;
    this.#baseline = null;
    const empty = { custom: {}, dynamic: {}, advanced: {} };
    if (!url) return empty;
    const config = getConfigurationByUrl(url);
    this.#destinationType = config.customKey ?? config.key;
    try {
      const parsed = fromTargetPath(url);
      if (parsed)
        this.#baseline = copyDestinationForm({
          custom: parsed.custom ?? {},
          dynamic: parsed.dynamic ?? {},
          advanced: parsed.advanced ?? {},
        });
      else if (/^[^:]+:\/\/$/.test(url)) this.#baseline = empty;
    } catch {
      // Keep an unparseable URL intact; it can still be corrected in the raw URL editor.
    }
    return copyDestinationForm(this.#baseline ?? empty);
  }

  commit(form: DestinationFormValues): string | null {
    if (!this.url || !this.#baseline) return null;
    try {
      const before = toTargetPath({ destinationType: this.#destinationType, ...copyDestinationForm(this.#baseline) });
      const after = toTargetPath({ destinationType: this.#destinationType, ...copyDestinationForm(form) });
      if (!after) return null;
      const url = mergeDestinationUrlEdits(this.url, before, after);
      this.url = url;
      this.#baseline = copyDestinationForm(form);
      return url;
    } catch {
      // A broken mapper must not replace the last valid connection string.
      return null;
    }
  }
}
