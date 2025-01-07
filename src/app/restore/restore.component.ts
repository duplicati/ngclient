import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleCardComponent,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { BackupAndScheduleOutputDto, DuplicatiServerService } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';

@Component({
  selector: 'app-restore',
  imports: [
    StatusBarComponent,
    SparkleCardComponent,
    SparkleButtonComponent,
    SparkleDividerComponent,
    SparkleIconComponent,
    SparkleProgressBarComponent,
    RouterLink,
  ],
  templateUrl: './restore.component.html',
  styleUrl: './restore.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreComponent {
  #backupsState = inject(BackupsState);
  #dupServer = inject(DuplicatiServerService);

  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;

  ngOnInit() {
    this.#backupsState.getBackups();
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
