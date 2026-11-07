export type RetentionType = 'all' | 'time' | 'versions' | 'smart' | 'custom';

export const SMART_RETENTION = '1W:1D,4W:1W,12M:1M';

/** Writes each sync run into its own dated folder below the destination. */
export const SYNC_SNAPSHOT_FOLDERS_OPTION = 'sync-snapshot-folders';

/** The number of snapshot folders a snapshot sync keeps; 0 keeps all. */
export const SYNC_KEEP_SNAPSHOTS_OPTION = 'sync-keep-snapshots';

/** Copies unchanged files into each snapshot instead of hard linking them from the previous one. */
export const SYNC_SNAPSHOT_DISABLE_HARDLINKS_OPTION = 'sync-snapshot-disable-hardlinks';

/** The option names the Sync options step manages, as they may be stored (with and without the prefix). */
export const SYNC_SNAPSHOT_OPTION_NAMES = [
  SYNC_SNAPSHOT_FOLDERS_OPTION,
  SYNC_KEEP_SNAPSHOTS_OPTION,
  SYNC_SNAPSHOT_DISABLE_HARDLINKS_OPTION,
].flatMap((x) => [x, `--${x}`]);

export type BackupOptionsFormValue = {
  backupRetention: RetentionType;
  backupRetentionTime: string;
  backupRetentionVersions: number | null;
  backupRetentionCustom: string;
  syncSnapshotFolders: boolean;
  syncKeepSnapshots: number | null;
  syncSnapshotDisableHardlinks: boolean;
};
