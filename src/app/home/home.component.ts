import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleButtonGroupComponent,
  SparkleCardComponent,
  SparkleChipComponent,
  SparkleDialogService,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
  SparkleSortDirective,
  SparkleTableComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DESTINATION_CONFIG } from '../backup/destination/destination.config';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { DuplicatiServerService } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { BackupsState, OrderBy, TimeType } from '../core/states/backups.state';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    StatusBarComponent,
    SparkleCardComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleChipComponent,
    SparkleDividerComponent,
    SparkleMenuComponent,
    SparkleProgressBarComponent,
    SparkleButtonGroupComponent,
    SparkleTableComponent,
    SparkleSortDirective,
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

  viewMode = localStorageSignal<'list' | 'details'>('list', 'viewMode');
  sortByColumn = signal<OrderBy | null>('name');
  loadingId = signal<string | null>(null);
  successId = signal<string | null>(null);

  sortEffect = effect(() => this.#backupsState.setOrderBy(this.sortByColumn() as OrderBy));

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

  getBackendType(targetUrl: string | null | undefined) {
    if (!targetUrl) return '';
    const backend = targetUrl.split('://')[0];

    return DESTINATION_CONFIG.find((x) => x.key === backend)?.displayName ?? '';
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
