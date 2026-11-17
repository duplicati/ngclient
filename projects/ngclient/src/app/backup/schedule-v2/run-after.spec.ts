import { describe, expect, it } from 'vitest';
import { BackupAndScheduleOutputDto, ScheduleDto } from '../../core/openapi';
import { getRunAfterName, getRunAfterOptions, hasOwnTrigger, isSameRunAfterOptions } from './run-after';

function job(id: string, runAfter: string | null, extra: Partial<BackupAndScheduleOutputDto['Backup']> = {}) {
  return {
    Backup: { ID: id, Name: `Job ${id}`, RunAfterBackupID: runAfter, ...extra },
    Schedule: null,
  } as unknown as BackupAndScheduleOutputDto;
}

describe('jobs to run after', () => {
  // 2 and 4 run after 1, 3 runs after 2, and 5 stands alone
  const jobs = [job('1', null), job('2', '1'), job('3', '2'), job('4', '1'), job('5', null)];

  it('offers every job to a job that is not saved yet', () => {
    expect(getRunAfterOptions(jobs, null, null).map((x) => x.value)).toEqual(['1', '2', '3', '4', '5']);
    expect(getRunAfterOptions(jobs, 'new', null).map((x) => x.value)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('leaves out the job itself and the jobs that run after it', () => {
    expect(getRunAfterOptions(jobs, '1', null).map((x) => x.value)).toEqual(['5']);
    expect(getRunAfterOptions(jobs, '2', null).map((x) => x.value)).toEqual(['1', '4', '5']);
    expect(getRunAfterOptions(jobs, '3', null).map((x) => x.value)).toEqual(['1', '2', '4', '5']);
  });

  it('labels the options with the job names', () => {
    expect(getRunAfterOptions(jobs, '3', null)[0]).toEqual({ value: '1', label: 'Job 1' });
    expect(getRunAfterOptions([job('7', null, { Name: null })], null, null)[0]).toEqual({ value: '7', label: '7' });
  });

  it('always offers the job that is picked', () => {
    // The list of jobs is not loaded yet
    expect(getRunAfterOptions([], '2', '1')).toEqual([{ value: '1', label: '1' }]);
    // A job that is already offered is not added twice
    expect(getRunAfterOptions(jobs, '2', '1').map((x) => x.value)).toEqual(['1', '4', '5']);
    // A job that would not be offered is added with its name
    expect(getRunAfterOptions(jobs, '1', '2').map((x) => x.label)).toEqual(['Job 5', 'Job 2']);
  });

  it('compares options by their content', () => {
    expect(isSameRunAfterOptions(getRunAfterOptions(jobs, '2', '1'), getRunAfterOptions([...jobs], '2', '1'))).toBe(true);
    expect(isSameRunAfterOptions(getRunAfterOptions([], '2', '1'), getRunAfterOptions(jobs, '2', '1'))).toBe(false);
    expect(isSameRunAfterOptions([{ value: '1', label: '1' }], [{ value: '1', label: 'Job 1' }])).toBe(false);
  });

  it('finds the name of the job a job runs after', () => {
    expect(getRunAfterName(jobs, '2')).toBe('Job 2');
    expect(getRunAfterName(jobs, null)).toBeNull();
    expect(getRunAfterName(jobs, undefined)).toBeNull();
    expect(getRunAfterName(jobs, '99')).toBeNull();
  });

  it('knows if a job starts by itself', () => {
    const scheduled = { ...job('1', null), Schedule: { Repeat: '1D' } as ScheduleDto };

    expect(hasOwnTrigger(scheduled)).toBe(true);
    expect(hasOwnTrigger(job('2', '1'))).toBe(true);
    expect(hasOwnTrigger(job('5', null))).toBe(false);
    expect(hasOwnTrigger({ ...scheduled, Backup: { ...scheduled.Backup, Enabled: false } })).toBe(false);
    expect(hasOwnTrigger(null)).toBe(false);
  });
});
