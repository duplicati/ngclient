import { BackupDto } from '../../core/openapi';

export type CompareChangeType = 'added' | 'modified' | 'deleted';

export type CompareChange = {
  type: CompareChangeType;
  path: string;
  isFolder: boolean;
};

export type CompareCounts = {
  files: number;
  folders: number;
  symlinks: number;
};

export type CompareResult = {
  changes: CompareChange[];
  totals: Record<CompareChangeType, CompareCounts>;
  // The sizes as the server formats them, null when the output has none
  baseSize: string | null;
  targetSize: string | null;
  // Entries the server left out of the list, which only happens without --full-result
  omitted: number;
};

const CHANGE_TYPE_BY_MARKER: Record<string, CompareChangeType> = { '+': 'added', '~': 'modified', '-': 'deleted' };

// "symlinka" is how the server spells the modified symlinks line
const ELEMENT_BY_NAME: Record<string, keyof CompareCounts> = {
  files: 'files',
  folders: 'folders',
  symlinks: 'symlinks',
  symlinka: 'symlinks',
};

const emptyCounts = (): CompareCounts => ({ files: 0, folders: 0, symlinks: 0 });

/**
 * Builds the COMPARE command for two versions of a backup, as the command editor would.
 * The changes are reported going from the base version to the target version.
 */
export function buildCompareCommand(backup: BackupDto, base: number, target: number): string[] {
  const reserved = ['dbpath', 'backup-id', 'backup-name', 'full-result'];
  const settings = (backup.Settings ?? [])
    .filter((x) => x.Name && !reserved.includes(x.Name.replace(/^--/, '')))
    .map((x) => `${x.Name!.startsWith('--') ? '' : '--'}${x.Name}=${x.Value ?? ''}`);

  return [
    'compare',
    backup.TargetURL ?? '',
    `${base}`,
    `${target}`,
    `--backup-name=${backup.Name ?? ''}`,
    `--dbpath=${backup.DBPath ?? ''}`,
    `--backup-id=${backup.ID ?? ''}`,
    ...settings,
    // Without this the server lists only the first entries of each kind
    '--full-result',
    '--disable-module=console-password-input',
  ].filter((x) => x.length > 0);
}

/**
 * Reads the output of the COMPARE command.
 * Returns null when the output holds no comparison, which is the case when the command failed.
 */
export function parseCompareOutput(output: string[]): CompareResult | null {
  const lines = output.flatMap((x) => x.split(/\r?\n/));
  const start = lines.findIndex((x) => x.trim() === 'Listing changes');
  if (start < 0) return null;

  const result: CompareResult = {
    changes: [],
    totals: { added: emptyCounts(), modified: emptyCounts(), deleted: emptyCounts() },
    baseSize: null,
    targetSize: null,
    omitted: 0,
  };
  const sizes: string[] = [];
  // Paths are only read inside a list of entries, so no other line is taken for one
  let inEntries = false;

  for (const line of lines.slice(start + 1)) {
    if (/^\s*\d+ (added|modified|deleted) entries:\s*$/.test(line)) {
      inEntries = true;
      continue;
    }

    const size = /^\s*Size of backup \d+: (.*)$/.exec(line);
    if (size) {
      inEntries = false;
      sizes.push(size[1].trim());
      continue;
    }

    const total = /^\s*(Added|Modified|Deleted) (files|folders|symlinks|symlinka):\s*(\d+)\s*$/.exec(line);
    if (total) {
      inEntries = false;
      result.totals[total[1].toLowerCase() as CompareChangeType][ELEMENT_BY_NAME[total[2]]] = parseInt(total[3], 10);
      continue;
    }

    if (!inEntries) continue;

    const omitted = /^\s*\.\.\. and (\d+) more\s*$/.exec(line);
    if (omitted) {
      result.omitted += parseInt(omitted[1], 10);
      continue;
    }

    const entry = /^\s*([+~-]) (.+)$/.exec(line);
    if (entry) {
      const path = entry[2];
      result.changes.push({ type: CHANGE_TYPE_BY_MARKER[entry[1]], path, isFolder: /[\\/]$/.test(path) });
    }
  }

  result.baseSize = sizes[0] ?? null;
  result.targetSize = sizes[1] ?? null;
  return result;
}
