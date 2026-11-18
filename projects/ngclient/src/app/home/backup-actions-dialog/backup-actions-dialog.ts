import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { SysinfoState } from '../../core/states/sysinfo.state';

export type BackupActionsDialogData = {
  id: string;
  name: string;
  isSync: boolean;
  isExternal: boolean;
  isDisabled: boolean;
};

export type BackupActionId =
  | 'restore'
  | 'export'
  | 'enable'
  | 'disable'
  | 'delete'
  | 'database'
  | 'verify'
  | 'test-restore'
  | 'commandline'
  | 'compare'
  | 'version-labels'
  | 'delete-versions'
  | 'purge-files'
  | 'broken-files'
  | 'log';

export type BackupAction = {
  id: BackupActionId;
  icon: string;
  label: string;
  description: string;
  // Where the action lives, for the actions that are a page of their own
  route?: string[];
  danger?: boolean;
};

// Icon names chosen in code are only included in the generated icon font when they carry the shicon prefix
const shIcon = (marked: `shicon:${string}`) => marked.slice('shicon:'.length);

export type BackupActionGroup = { title: string; actions: BackupAction[] };

@Component({
  selector: 'app-backup-actions-dialog',
  imports: [ShipButton, ShipIcon],
  templateUrl: './backup-actions-dialog.html',
  styleUrl: './backup-actions-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupActionsDialog {
  #sysinfo = inject(SysinfoState);

  data = input<BackupActionsDialogData>();
  // The picked action, or null when the dialog is dismissed
  closed = output<BackupAction | null>();

  closeLabel = $localize`Close`;

  groups = computed<BackupActionGroup[]>(() => {
    const data = this.data();
    if (!data) return [];

    const { id, isSync, isExternal, isDisabled } = data;
    const page = (segment: string) => ['/backup', id, segment];
    const on = (condition: boolean, action: BackupAction) => (condition ? [action] : []);

    const database: BackupAction = {
      id: 'database',
      icon: shIcon('shicon:database'),
      label: $localize`Database`,
      description: isSync
        ? $localize`Move the local database.`
        : $localize`Repair, recreate or move the local database.`,
      route: page('database'),
    };

    const groups: BackupActionGroup[] = [
      {
        title: $localize`Operations`,
        actions: [
          ...on(!isSync || this.#sysinfo.hasSyncRestore(), {
            id: 'restore',
            icon: shIcon('shicon:clock-counter-clockwise'),
            label: $localize`Restore`,
            description: isSync
              ? $localize`Recover files from this sync job.`
              : $localize`Recover files from this backup.`,
            route: ['/restore', id],
          }),
          ...on(!isExternal, {
            id: 'export',
            icon: shIcon('shicon:export'),
            label: $localize`Export`,
            description: $localize`Save the configuration to a file or as a command line.`,
            route: page('export'),
          }),
          ...on(
            this.#sysinfo.hasBackupEnableDisable(),
            isDisabled
              ? {
                  id: 'enable',
                  icon: shIcon('shicon:check-circle'),
                  label: $localize`Enable`,
                  description: $localize`Resume the scheduled runs.`,
                }
              : {
                  id: 'disable',
                  icon: shIcon('shicon:prohibit'),
                  label: $localize`Disable`,
                  description: $localize`Skip the scheduled runs until enabled again.`,
                }
          ),
          ...on(!isExternal, {
            id: 'delete',
            icon: shIcon('shicon:x-circle'),
            label: $localize`Delete`,
            description: isSync
              ? $localize`Remove this sync job, and optionally its data.`
              : $localize`Remove this backup job, and optionally the backed-up data.`,
            route: page('delete'),
            danger: true,
          }),
        ],
      },
      {
        title: $localize`Versions`,
        actions: isSync
          ? []
          : [
              {
                id: 'compare',
                icon: shIcon('shicon:git-diff'),
                label: $localize`Compare versions`,
                description: $localize`See what changed between two versions.`,
                route: page('compare'),
              },
              ...on(this.#sysinfo.hasV2SetVersionLabel(), {
                id: 'version-labels',
                icon: shIcon('shicon:tag'),
                label: $localize`Version labels`,
                description: $localize`Name versions to find them again later.`,
                route: page('version-labels'),
              }),
              ...on(this.#sysinfo.hasV2DeleteVersions(), {
                id: 'delete-versions',
                icon: shIcon('shicon:trash'),
                label: $localize`Delete versions`,
                description: $localize`Remove versions that are no longer needed.`,
                route: page('delete-versions'),
              }),
              ...on(this.#sysinfo.hasV2PurgeFiles(), {
                id: 'purge-files',
                icon: shIcon('shicon:eraser'),
                label: $localize`Remove files`,
                description: $localize`Permanently remove selected files from the existing versions.`,
                route: page('purge-files'),
              }),
            ],
      },
      {
        title: $localize`Verify and repair`,
        actions: isSync
          ? []
          : [
              {
                id: 'verify',
                icon: shIcon('shicon:check-square-offset'),
                label: $localize`Verify files`,
                description: $localize`Check that the backup data at the destination is intact.`,
              },
              ...on(this.#sysinfo.hasV2RestoreTest(), {
                id: 'test-restore',
                icon: shIcon('shicon:seal-check'),
                label: $localize`Test restore`,
                description: $localize`Restore a sample of files to check that they can be recovered.`,
              }),
              database,
              ...on(this.#sysinfo.hasV2BrokenFiles(), {
                id: 'broken-files',
                icon: shIcon('shicon:file-x'),
                label: $localize`Purge broken files`,
                description: $localize`Purge files affected by missing or damaged data.`,
                route: page('broken-files'),
              }),
            ],
      },
      {
        title: $localize`Advanced`,
        actions: [
          // A Sync job has nothing to verify or repair, so its database page is listed here
          ...on(isSync, database),
          {
            id: 'commandline',
            icon: shIcon('shicon:terminal-window'),
            label: $localize`Command line`,
            description: isSync
              ? $localize`Run advanced commands on this sync job.`
              : $localize`Run advanced commands on this backup.`,
            route: page('commandline'),
          },
          {
            id: 'log',
            icon: shIcon('shicon:notepad'),
            label: $localize`Log`,
            description: $localize`See what happened in the earlier runs.`,
            route: page('log'),
          },
        ],
      },
    ];

    return groups.filter((x) => x.actions.length > 0);
  });
}
