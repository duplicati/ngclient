import { describe, expect, it } from 'vitest';
import { LastRunPipe } from './last-run.pipe';

describe('LastRunPipe', () => {
  const pipe = new LastRunPipe();

  const backupKeys = { LastBackupFinished: '20260921T100045Z', LastBackupDuration: '00:00:45' };
  const syncKeys = { LastSyncFinished: '20260921T135037Z', LastSyncDuration: '01:59:58.9212731' };

  it.each([null, undefined, {}, { Metadata: null }, { Metadata: {} }] as const)('returns undefined for %o', (job) => {
    expect(pipe.transform(job)).toBeUndefined();
    expect(pipe.transform(job, 'duration')).toBeUndefined();
  });

  it('reads the backup keys for a backup job', () => {
    const job = { OperationType: 'Backup' as const, Metadata: backupKeys };

    expect(pipe.transform(job)).toBe('20260921T100045Z');
    expect(pipe.transform(job, 'duration')).toBe('00:00:45');
  });

  it('treats a job without an operation type as a backup', () => {
    expect(pipe.transform({ Metadata: { ...backupKeys, ...syncKeys } })).toBe('20260921T100045Z');
  });

  it('reads the sync keys for a sync job', () => {
    const job = { OperationType: 'Sync' as const, Metadata: syncKeys };

    expect(pipe.transform(job)).toBe('20260921T135037Z');
    expect(pipe.transform(job, 'duration')).toBe('01:59:58.9212731');
  });

  it('prefers the sync keys for a sync job that has both', () => {
    const job = { OperationType: 'Sync' as const, Metadata: { ...backupKeys, ...syncKeys } };

    expect(pipe.transform(job)).toBe('20260921T135037Z');
    expect(pipe.transform(job, 'duration')).toBe('01:59:58.9212731');
  });

  it('falls back to the backup keys for a sync job without sync keys', () => {
    const job = { OperationType: 'Sync' as const, Metadata: backupKeys };

    expect(pipe.transform(job)).toBe('20260921T100045Z');
  });

  it('does not read the sync keys for a backup job', () => {
    const job = { OperationType: 'Backup' as const, Metadata: syncKeys };

    expect(pipe.transform(job)).toBeUndefined();
  });
});
