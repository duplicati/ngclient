/**
 * Builds a file name such as `duplicati-remote-log-backup-3-2026-11-14T10-30-00.json`.
 * Colons and dots are replaced so the name is valid on every file system.
 */
export function logFileName(kind: string, backupId?: string | null, now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/:/g, '-');
  const backup = backupId ? `-backup-${backupId}` : '';
  return `duplicati-${kind}${backup}-${stamp}.json`;
}

/** Saves the value as a pretty printed JSON file through the browser's download prompt */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
