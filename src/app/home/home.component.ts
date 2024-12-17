import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleCardComponent,
  SparkleChipComponent,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServerService } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { BackupsState } from '../core/states/backups.state';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    StatusBarComponent,
    SparkleCardComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleChipComponent,
    SparkleDividerComponent,
    SparkleMenuComponent,
    SparkleProgressBarComponent,
    DatePipe,
    DurationFormatPipe,
    BytesPipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomeComponent {
  #backupsState = inject(BackupsState);
  #dupServer = inject(DuplicatiServerService);

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;
  startingBackup = this.#backupsState.startingBackup;
  deletingBackup = this.#backupsState.deletingBackup;

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  startBackup(id: string) {
    this.#backupsState.startBackup(id);
  }

  deleteBackup(id: string) {
    window.confirm('Are you sure you want to delete this backup?') && this.#backupsState.deleteBackup(id);
  }

  verifyFiles(id: string) {
    this.#dupServer.postApiV1BackupByIdVerify({ id }).subscribe();
  }

  compressBackup(id: string) {
    this.#dupServer.postApiV1BackupByIdCompact({ id }).subscribe();
  }

  createErrorReport(id: string) {
    this.#dupServer.postApiV1BackupByIdCreatereport({ id }).subscribe();
  }
}
