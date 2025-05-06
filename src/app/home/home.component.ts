import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleCardComponent,
  SparkleChipComponent,
  SparkleDialogService,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServerService } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { BackupsState, OrderBy, TimeType } from '../core/states/backups.state';

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
    DurationFormatPipe,
    BytesPipe,
    RelativeTimePipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomeComponent {
  #backupsState = inject(BackupsState);
  #dialog = inject(SparkleDialogService);
  #dupServer = inject(DuplicatiServerService);

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  sortOrderOptions = this.#backupsState.orderByOptions;
  orderBy = this.#backupsState.orderBy;
  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;
  startingBackup = this.#backupsState.startingBackup;
  deletingBackup = this.#backupsState.deletingBackup;

  timeType = this.#backupsState.timeType;

  loadingId = signal<string | null>(null);
  successId = signal<string | null>(null);

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  setOrderBy(orderBy: OrderBy) {
    this.#backupsState.setOrderBy(orderBy);
  }

  setTimeType(timeType: TimeType) {
    this.#backupsState.setTimeType(timeType);
  }

  startBackup(id: string) {
    this.#backupsState.startBackup(id);
  }

  deleteBackup(id: string) {
    this.loadingId.set(id);
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm delete`,
        message: $localize`Are you sure you want to delete this backup?`,
        confirmText: $localize`Delete backup`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        this.#backupsState.deleteBackup(id);
      },
    });
  }

  verifyFiles(id: string) {
    this.loadingId.set(id);
    this.#dupServer
      .postApiV1BackupByIdVerify({ id })
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }

  compressBackup(id: string) {
    this.loadingId.set(id);
    this.#dupServer
      .postApiV1BackupByIdCompact({ id })
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }

  createErrorReport(id: string) {
    this.loadingId.set(id);
    this.#dupServer
      .postApiV1BackupByIdCreatereport({ id })
      .pipe(finalize(() => this.loadingId.set(null)))
      .subscribe({
        next: () => {
          this.successId.set(id);

          setTimeout(() => this.successId.set(null), 2000);
        },
      });
  }
}
