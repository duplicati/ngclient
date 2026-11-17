import { BackupAndScheduleOutputDto } from '../../core/openapi';

export type RunAfterOption = {
  value: string;
  label: string;
};

// The jobs a job can run after: every saved job except the job itself and the jobs
// that already run after it, directly or through other jobs, as picking one would make a loop.
// The job that is picked now is always an option, also while the list of jobs is not loaded:
// a picker that cannot find its value among the options reports the choice as emptied.
export function getRunAfterOptions(
  backups: BackupAndScheduleOutputDto[],
  backupId: string | null,
  selectedId: string | null
): RunAfterOption[] {
  const blocked = new Set<string>();

  if (backupId) {
    blocked.add(backupId);

    let added = true;
    while (added) {
      added = false;
      for (const x of backups) {
        const id = x.Backup?.ID;
        const runAfter = x.Backup?.RunAfterBackupID;
        if (id && runAfter && blocked.has(runAfter) && !blocked.has(id)) {
          blocked.add(id);
          added = true;
        }
      }
    }
  }

  const options = backups
    .filter((x) => x.Backup?.ID && !blocked.has(x.Backup.ID))
    .map((x) => ({ value: x.Backup!.ID!, label: x.Backup!.Name ?? x.Backup!.ID! }));

  if (selectedId && !options.some((x) => x.value === selectedId))
    options.push({ value: selectedId, label: getRunAfterName(backups, selectedId) ?? selectedId });

  return options;
}

export function isSameRunAfterOptions(a: RunAfterOption[], b: RunAfterOption[]) {
  return a.length === b.length && a.every((x, i) => x.value === b[i].value && x.label === b[i].label);
}

// The name of the job a job runs after, or null if it does not run after a job in the list
export function getRunAfterName(backups: BackupAndScheduleOutputDto[], runAfterBackupId: string | null | undefined) {
  if (!runAfterBackupId) return null;

  const match = backups.find((x) => x.Backup?.ID === runAfterBackupId);
  return match ? (match.Backup?.Name ?? runAfterBackupId) : null;
}

// A job only runs after another job when that job runs, so the other job needs a trigger of its own
export function hasOwnTrigger(backup: BackupAndScheduleOutputDto | null | undefined) {
  return !!backup && backup.Backup?.Enabled !== false && (!!backup.Schedule || !!backup.Backup?.RunAfterBackupID);
}
