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

export type LastRunError = {
  date: string;
  message: string;
};

// The server writes dates as basic ISO 8601 in UTC, e.g. 20260921T100045Z
function parseServerDate(value: string | null | undefined): number | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value ?? '');
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * Reads the error of the last run of a job, if the last run failed.
 * The server records LastErrorDate and LastErrorMessage when a run fails, and the
 * finished time when a run completes, so the newer of the two tells whether the
 * latest attempt failed. This matches how the server decides the folder status.
 * LastBackupDate is used for a backup job whose metadata predates the finished key.
 */
export function getLastRunError(job: JobWithMetadata | null | undefined): LastRunError | undefined {
  const metadata = job?.Metadata;
  const errorDate = metadata?.['LastErrorDate'];
  const errorTime = parseServerDate(errorDate);
  if (!metadata || !errorDate || errorTime === undefined) return undefined;

  const finished =
    getLastRunValue(job, 'finished') ?? (job?.OperationType === 'Sync' ? undefined : metadata['LastBackupDate']);
  const finishedTime = parseServerDate(finished);
  if (finishedTime !== undefined && errorTime < finishedTime) return undefined;

  return { date: errorDate, message: metadata['LastErrorMessage'] ?? '' };
}

@Pipe({
  name: 'lastRunError',
  standalone: true,
})
export class LastRunErrorPipe implements PipeTransform {
  transform(job: JobWithMetadata | null | undefined): LastRunError | undefined {
    return getLastRunError(job);
  }
}
