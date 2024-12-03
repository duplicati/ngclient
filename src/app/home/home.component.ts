import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleCardComponent,
  SparkleChipComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
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
    SparkleMenuComponent,
    SparkleProgressBarComponent,
    DatePipe,
    DurationFormatPipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomeComponent {
  #backupsState = inject(BackupsState);

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

  deleteBackup(id: string | null | undefined) {
    if (!id) return;

    window.confirm('Are you sure you want to delete this backup?') && this.#backupsState.deleteBackup(id);
  }
}
