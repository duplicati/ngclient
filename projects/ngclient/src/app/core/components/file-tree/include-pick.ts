import { isFolderPath } from './file-tree-path-utils';

/**
 * An "include pick" turns a source folder into an allow list: only the picked entries are
 * backed up, everything else in the folder is excluded. It is stored as ordinary filters,
 * so the backend and the filter list need no new concepts:
 *
 *   /home/user/Projects/              <- the folder stays a plain source path
 *   -/home/user/Projects/ngclient/node_modules/   <- (optional) excludes inside a pick
 *   +/home/user/Projects/docs/        <- a folder on the way down to a deeper pick: the backup
 *                                        must be able to enter it, but nothing else in it is kept
 *   +/home/user/Projects/ngclient/*   <- a picked folder: the wildcard also matches the folder
 *                                        entry itself, so one rule enters it and keeps its contents
 *   +/home/user/Projects/docs/plan.md <- a picked file
 *   -/home/user/Projects/*            <- the catch-all excludes every other entry
 *
 * Filters are evaluated in order with the first match winning, so the block is kept contiguous:
 * excludes first, then the folder rules and picks, then the catch-all.
 *
 * The folder is the source path as the tree sees it: a local path, a shortcut token such as
 * %MY_DOCUMENTS% (whose entries are listed as %MY_DOCUMENTS%/name), or the mount folder of a
 * remote source stored as @mount|url (whose entries are listed under the mount).
 */
export type IncludePick = {
  /** The source folder the pick applies to, with its trailing separator. */
  folder: string;
  /** Picked files and folders, as full paths. Folders keep their trailing separator. */
  picks: string[];
  /** Paths inside a picked folder that are excluded again, as full paths. */
  excludes: string[];
  /** The separator after a shortcut token, as the catch-all exclude uses it. */
  separator: string;
  /** Index in the path array of the first filter belonging to the block. */
  start: number;
  /** Index in the path array of the catch-all exclude that ends the block. */
  end: number;
};

export const isFilterPath = (path: string) => path.startsWith('+') || path.startsWith('-');

/** A bare shortcut token such as %MY_DOCUMENTS%; its entries are listed as %MY_DOCUMENTS%/name. */
const isShortcut = (path: string) =>
  path.startsWith('%') && path.endsWith('%') && !path.includes('/') && !path.includes('\\');

/** A remote source is stored as @mount|url, optionally followed by |subpath. */
const isRemoteSource = (path: string) => path.startsWith('@') && path.includes('|');

/**
 * The folder a source path stands for in the tree: a remote source's mount folder with its
 * trailing separator, any other source as-is.
 */
export const sourceFolderOf = (path: string) => {
  if (!isRemoteSource(path)) return path;
  const mount = path.slice(1, path.indexOf('|'));
  const separator = mount.includes('\\') && !mount.includes('/') ? '\\' : '/';
  return mount.endsWith(separator) ? mount : mount + separator;
};

/**
 * The remote source entry to list the folder through, when the folder is the mount of a remote
 * source or lies inside one: the @mount|url entry, with the folder's path below the mount appended
 * as |subpath when it is not the mount itself. Null for local folders.
 */
export const remoteSourceFor = (paths: string[], folder: string): string | null => {
  for (const path of paths) {
    if (isFilterPath(path) || !isRemoteSource(path)) continue;
    const mount = sourceFolderOf(path);
    if (folder === mount) return path;
    if (!isInside(folder, mount)) continue;
    const [prefix, url] = path.split('|');
    return `${prefix}|${url}|${folder.slice(mount.length - 1)}`;
  }
  return null;
};

/** The prefix shared by everything inside the folder. A shortcut token needs a separator after it. */
export const includePickPrefix = (folder: string, separator = '/') =>
  isShortcut(folder) ? folder + separator : folder;

const prefixesOf = (folder: string) => (isShortcut(folder) ? [folder + '/', folder + '\\'] : [folder]);

export const includePickCatchAll = (folder: string, separator = '/') => `-${includePickPrefix(folder, separator)}*`;

const isInside = (path: string, folder: string) =>
  path !== folder && prefixesOf(folder).some((prefix) => path.startsWith(prefix));

const isSourceFor = (path: string, folder: string) => !isFilterPath(path) && sourceFolderOf(path) === folder;

/** The separator the entries inside a shortcut use, read from the first entry that is inside it. */
const separatorFor = (folder: string, entries: string[], fallback: string) => {
  if (!isShortcut(folder)) return fallback;
  const inside = entries.find((entry) => isInside(entry, folder));
  return inside ? inside.charAt(folder.length) : fallback;
};

/** The folders strictly between the pick folder and the path, outermost first, with separators. */
const foldersBetween = (folder: string, path: string): string[] => {
  const prefix = prefixesOf(folder).find((candidate) => path.startsWith(candidate));
  if (!prefix) return [];
  const separator = prefix.charAt(prefix.length - 1);
  const parts = path.slice(prefix.length).split(separator);
  // The last part is the entry itself (or the empty string after a folder's trailing separator)
  const names = isFolderPath(path) ? parts.slice(0, -2) : parts.slice(0, -1);

  const folders: string[] = [];
  let current = prefix;
  for (const name of names) {
    current += name + separator;
    folders.push(current);
  }
  return folders;
};

/** The filter rules for one pick, in evaluation order. */
export const buildIncludePickBlock = (
  folder: string,
  picks: string[],
  excludes: string[] = [],
  separator = '/'
): string[] => {
  const block: string[] = [];

  for (const exclude of excludes) {
    if (isInside(exclude, folder)) block.push(`-${exclude}`);
  }

  const inside = picks.filter((pick) => isInside(pick, folder));
  const pickedFolders = inside.filter((pick) => isFolderPath(pick));

  // The backup only descends into folders that are included, so every folder on the way down to
  // a deeper pick gets a rule of its own. The rule matches the folder entry only, not its contents.
  const entered = new Set<string>();
  for (const pick of inside) {
    for (const between of foldersBetween(folder, pick)) {
      if (pickedFolders.some((picked) => between === picked || between.startsWith(picked))) continue;
      entered.add(between);
    }
  }
  for (const between of entered) block.push(`+${between}`);

  for (const pick of inside) {
    block.push(isFolderPath(pick) ? `+${pick}*` : `+${pick}`);
  }

  block.push(includePickCatchAll(folder, separatorFor(folder, [...picks, ...excludes], separator)));
  return block;
};

/** The pick stored for a source folder, or null when the folder has no catch-all exclude. */
export const findIncludePick = (paths: string[], folder: string): IncludePick | null => {
  if (!isFolderPath(folder) || !paths.some((path) => isSourceFor(path, folder))) return null;

  const catchAll = prefixesOf(folder).map((prefix) => `-${prefix}*`);
  const end = paths.findIndex((path) => catchAll.includes(path));
  if (end === -1) return null;
  const separator = isShortcut(folder) ? paths[end].charAt(folder.length + 1) : '/';

  const picks: string[] = [];
  const excludes: string[] = [];
  let start = end;

  for (let index = end - 1; index >= 0; index--) {
    const entry = paths[index];
    const target = entry.slice(1);
    if (!isFilterPath(entry) || !isInside(target, folder)) break;

    start = index;
    if (entry.startsWith('-')) {
      excludes.unshift(target);
    } else if (target.endsWith('*') && isFolderPath(target.slice(0, -1))) {
      picks.unshift(target.slice(0, -1));
    } else if (!target.endsWith('*') && !isFolderPath(target)) {
      picks.unshift(target);
    }
    // A plain folder rule only lets the backup enter the folder on the way to a deeper pick
  }

  return { folder, picks, excludes, separator, start, end };
};

/** Every pick in the path array, in the order the source folders appear. */
export const findIncludePicks = (paths: string[]): IncludePick[] => {
  const folders = new Set(paths.filter((path) => !isFilterPath(path)).map(sourceFolderOf));
  return [...folders]
    .filter((folder) => isFolderPath(folder))
    .map((folder) => findIncludePick(paths, folder))
    .filter((pick): pick is IncludePick => pick !== null);
};

/** The innermost pick whose folder contains the path, if the path is not the folder itself. */
export const findIncludePickContaining = (paths: string[], path: string): IncludePick | null => {
  const candidates = findIncludePicks(paths).filter((pick) => isInside(path, pick.folder));
  if (candidates.length === 0) return null;
  return candidates.reduce((inner, pick) => (pick.folder.length > inner.folder.length ? pick : inner));
};

/**
 * Stores a pick for the folder, replacing any existing block. The folder is added as a source
 * when it is missing, and source paths inside the folder are dropped since the pick covers them.
 * Picking the folder itself means "everything", which removes the block instead.
 */
export const applyIncludePick = (
  paths: string[],
  folder: string,
  picks: string[],
  excludes: string[] = [],
  separator = '/'
): string[] => {
  if (picks.includes(folder)) return removeIncludePick(paths, folder);

  const existing = findIncludePick(paths, folder);
  const block = buildIncludePickBlock(folder, picks, excludes, existing?.separator ?? separator);
  const result: string[] = [];

  paths.forEach((path, index) => {
    // The new block takes the place of the old one so it still wins over any later rules
    if (existing && index === existing.start) result.push(...block);
    if (existing && index >= existing.start && index <= existing.end) return;
    if (!isFilterPath(path) && isInside(path, folder)) return;
    result.push(path);
  });
  if (!existing) result.push(...block);

  if (!result.some((path) => isSourceFor(path, folder))) {
    const firstFilter = result.findIndex((path) => isFilterPath(path));
    result.splice(firstFilter === -1 ? result.length : firstFilter, 0, folder);
  }

  return result;
};

/** Removes the pick block for the folder; the folder stays a plain source. */
export const removeIncludePick = (paths: string[], folder: string): string[] => {
  const pick = findIncludePick(paths, folder);
  if (!pick) return [...paths];
  return [...paths.slice(0, pick.start), ...paths.slice(pick.end + 1)];
};

/**
 * Toggles one entry inside a picked folder, the way a click in the tree should behave:
 * a re-excluded entry becomes included again, a picked entry is unpicked, a folder on the way
 * down to deeper picks becomes a pick of its own, an entry included through a picked parent is
 * excluded, and anything else is picked.
 */
export const toggleInIncludePick = (
  paths: string[],
  pick: IncludePick,
  path: string,
  currentlyIncluded: boolean
): string[] => {
  let picks = pick.picks;
  let excludes = pick.excludes;
  const isFolder = isFolderPath(path);

  if (excludes.includes(path)) {
    excludes = excludes.filter((x) => x !== path);
  } else if (picks.includes(path)) {
    picks = picks.filter((x) => x !== path);
    // Excludes below the unpicked entry no longer serve a purpose
    excludes = excludes.filter((x) => !x.startsWith(path));
  } else if (currentlyIncluded && !(isFolder && picks.some((x) => isInside(x, path)))) {
    excludes = [...excludes, path];
  } else {
    picks = [...picks, path];
    if (isFolder) {
      // The new pick replaces any picks and excludes below it
      picks = picks.filter((x) => x === path || !x.startsWith(path));
      excludes = excludes.filter((x) => !x.startsWith(path));
    }
  }

  return applyIncludePick(paths, pick.folder, picks, excludes, pick.separator);
};
