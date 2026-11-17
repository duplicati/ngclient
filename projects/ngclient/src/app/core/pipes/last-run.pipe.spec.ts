import { describe, expect, it } from 'vitest';
import { LastRunErrorPipe, LastRunPipe } from './last-run.pipe';

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

describe('LastRunErrorPipe', () => {
  const pipe = new LastRunErrorPipe();

  const failed = { LastErrorDate: '20260921T110000Z', LastErrorMessage: 'The destination is unreachable' };

  it.each([null, undefined, {}, { Metadata: null }, { Metadata: {} }] as const)('returns undefined for %o', (job) => {
    expect(pipe.transform(job)).toBeUndefined();
  });

  it('returns undefined when the last backup finished after the last error', () => {
    const job = { OperationType: 'Backup' as const, Metadata: { ...failed, LastBackupFinished: '20260921T120000Z' } };

    expect(pipe.transform(job)).toBeUndefined();
  });

  it('reports the error when it is newer than the last finished backup', () => {
    const job = { OperationType: 'Backup' as const, Metadata: { ...failed, LastBackupFinished: '20260921T100045Z' } };

    expect(pipe.transform(job)).toEqual({ date: '20260921T110000Z', message: 'The destination is unreachable' });
  });

  it('reports the error when the backup never finished', () => {
    expect(pipe.transform({ Metadata: failed })).toEqual({
      date: '20260921T110000Z',
      message: 'The destination is unreachable',
    });
  });

  it('reports an error recorded at the same second as the finished time, like the server', () => {
    const job = { Metadata: { ...failed, LastBackupFinished: failed.LastErrorDate } };

    expect(pipe.transform(job)?.date).toBe('20260921T110000Z');
  });

  it('uses LastBackupDate for a backup job without a finished time', () => {
    expect(pipe.transform({ Metadata: { ...failed, LastBackupDate: '20260921T120000Z' } })).toBeUndefined();
    expect(pipe.transform({ Metadata: { ...failed, LastBackupDate: '20260921T100000Z' } })).toBeDefined();
  });

  it('compares a sync job with its sync finished time', () => {
    const job = {
      OperationType: 'Sync' as const,
      Metadata: { ...failed, LastBackupFinished: '20260921T120000Z', LastSyncFinished: '20260921T100000Z' },
    };

    expect(pipe.transform(job)?.message).toBe('The destination is unreachable');
    expect(
      pipe.transform({ ...job, Metadata: { ...job.Metadata, LastSyncFinished: '20260921T120000Z' } })
    ).toBeUndefined();
  });

  it('ignores LastBackupDate for a sync job', () => {
    const job = { OperationType: 'Sync' as const, Metadata: { ...failed, LastBackupDate: '20260921T120000Z' } };

    expect(pipe.transform(job)).toBeDefined();
  });

  it('returns an empty message when the server recorded none', () => {
    expect(pipe.transform({ Metadata: { LastErrorDate: failed.LastErrorDate } })?.message).toBe('');
  });

  it('ignores an unparsable error date', () => {
    expect(pipe.transform({ Metadata: { LastErrorDate: 'not a date', LastErrorMessage: 'x' } })).toBeUndefined();
  });
});
