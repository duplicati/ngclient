export type RetentionType = 'all' | 'time' | 'versions' | 'smart' | 'custom';

export const SMART_RETENTION = '1W:1D,4W:1W,12M:1M';

export type BackupOptionsFormValue = {
  backupRetention: RetentionType;
  backupRetentionTime: string;
  backupRetentionVersions: number | null;
  backupRetentionCustom: string;
};
