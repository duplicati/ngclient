import { Pipe, type PipeTransform } from '@angular/core';
import type { OperationType } from '../openapi';

export type LastRunField = 'finished' | 'duration';

type JobWithMetadata = {
  OperationType?: OperationType;
  Metadata?: { [key: string]: string | null } | null;
};

const BACKUP_KEYS: Record<LastRunField, string> = {
  finished: 'LastBackupFinished',
  duration: 'LastBackupDuration',
};

const SYNC_KEYS: Record<LastRunField, string> = {
  finished: 'LastSyncFinished',
  duration: 'LastSyncDuration',
};

/**
 * Reads the last completed run of a job from its metadata.
 * The server records a run under keys named after the operation, so a sync job
 * is read from the sync keys. The backup keys are used as a fallback for a sync
 * job, to support a server that reports all job types under the backup keys.
 */
export function getLastRunValue(job: JobWithMetadata | null | undefined, field: LastRunField): string | undefined {
  const metadata = job?.Metadata;
  if (!metadata) return undefined;

  if (job?.OperationType === 'Sync') {
    return metadata[SYNC_KEYS[field]] || metadata[BACKUP_KEYS[field]] || undefined;
  }

  return metadata[BACKUP_KEYS[field]] || undefined;
}

@Pipe({
  name: 'lastRun',
  standalone: true,
})
export class LastRunPipe implements PipeTransform {
  transform(job: JobWithMetadata | null | undefined, field: LastRunField = 'finished'): string | undefined {
    return getLastRunValue(job, field);
  }
}
