import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButton, ShipCard, ShipDivider, ShipIcon, ShipProgressBar } from '@ship-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { BackupAndScheduleOutputDto, DuplicatiServer } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';

@Component({
  selector: 'app-restore',
  imports: [StatusBarComponent, ShipCard, ShipButton, ShipDivider, ShipIcon, ShipProgressBar, RouterLink],
  templateUrl: './restore.component.html',
  styleUrl: './restore.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreComponent {
  #backupsState = inject(BackupsState);
  #dupServer = inject(DuplicatiServer);

  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  restoreNow(backup: BackupAndScheduleOutputDto) {
    this.#dupServer.postApiV1BackupByIdRestore({
      id: backup.Backup?.ID!,
      requestBody: {
        // paths?: Array<(string)> | null;
        // passphrase?: (string) | null;
        // time?: (string) | null;
        // restore_path?: (string) | null;
        // overwrite?: (boolean) | null;
        // permissions?: (boolean) | null;
        // skip_metadata?: (boolean) | null;
      },
    });
  }
}
