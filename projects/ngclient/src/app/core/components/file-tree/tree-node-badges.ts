export type TreeNodeBadge = {
  icon: string;
  label: string;
  announce?: boolean;
  /** Show the icon in place of the folder/file icon instead of as a corner badge. */
  replacesIcon?: boolean;
};

/**
 * Icon names chosen in code are invisible to the ship-fg font subsetter, which only scans
 * templates and string literals carrying the shicon prefix; the prefix makes it include the glyph.
 */
const shIcon = (marked: `shicon:${string}`) => marked.slice('shicon:'.length);

/**
 * Corner badges layered over the folder/file icon, keyed by the node `kind` sent by the
 * server (exact match first, then the part before the colon). `announce` adds the label
 * to the row's accessible name, for states the visible name does not already convey.
 */
export const TREE_NODE_BADGES: Record<string, TreeNodeBadge> = {
  symlink: { icon: shIcon('shicon:arrow-bend-up-right'), label: $localize`Symbolic link`, announce: true },
  locked: { icon: shIcon('shicon:lock'), label: $localize`Access denied`, announce: true },
  drive: { icon: shIcon('shicon:hard-drive'), label: $localize`Drive` },
  'drive:network': { icon: shIcon('shicon:globe-simple'), label: $localize`Network drive` },
  'drive:removable': { icon: shIcon('shicon:usb'), label: $localize`Removable drive` },
  special: { icon: shIcon('shicon:star'), label: $localize`Special folder` },
  'special:home': { icon: shIcon('shicon:user'), label: $localize`Home folder` },
  'special:my_documents': { icon: shIcon('shicon:file-text'), label: $localize`Documents folder` },
  'special:my_music': { icon: shIcon('shicon:music-note'), label: $localize`Music folder` },
  'special:my_pictures': { icon: shIcon('shicon:image'), label: $localize`Pictures folder` },
  'special:my_videos': { icon: shIcon('shicon:film-strip'), label: $localize`Videos folder` },
  'special:my_movies': { icon: shIcon('shicon:film-strip'), label: $localize`Movies folder` },
  'special:desktop': { icon: shIcon('shicon:desktop'), label: $localize`Desktop folder` },
  'special:appdata': { icon: shIcon('shicon:gear'), label: $localize`Application data folder` },
  'special:my_downloads': { icon: shIcon('shicon:download-simple'), label: $localize`Downloads folder` },
  'special:my_public': { icon: shIcon('shicon:users-three'), label: $localize`Public folder` },
  'qnap:share': { icon: shIcon('shicon:share-network'), label: $localize`QNAP shared folder` },
  hyperv: { icon: shIcon('shicon:cube'), label: $localize`Hyper-V` },
  'hyperv:virtualmachine': {
    icon: shIcon('shicon:monitor'),
    label: $localize`Hyper-V virtual machine`,
    replacesIcon: true,
  },
  mssql: { icon: shIcon('shicon:database'), label: $localize`Microsoft SQL Server` },
  'mssql:server': { icon: shIcon('shicon:hard-drives'), label: $localize`SQL Server host` },
  'mssql:instance': { icon: shIcon('shicon:stack'), label: $localize`SQL Server instance` },
  'mssql:database': { icon: shIcon('shicon:database'), label: $localize`SQL Server database`, replacesIcon: true },
};

/** The badge for a node kind such as special:desktop, falling back to the part before the colon. */
export function treeNodeBadgeForKind(kind: string | null | undefined): TreeNodeBadge | null {
  if (!kind) return null;
  return TREE_NODE_BADGES[kind] ?? TREE_NODE_BADGES[kind.split(':')[0]] ?? null;
}
