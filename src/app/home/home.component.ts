import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleButtonGroupComponent,
  SparkleCardComponent,
  SparkleChipComponent,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
  SparkleSortDirective,
  SparkleTableComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { S3_HOST_SUFFIX_MAP } from '../backup/destination/destination.config';
import { getConfigurationByKey } from '../backup/destination/destination.config-utilities';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { BackupAndScheduleOutputDto, DuplicatiServerService } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { BackupsState, OrderBy, TimeType } from '../core/states/backups.state';

const DestinationOverrides: Record<string, { Display: string | null; Icon: string | null }> = {
  file: { Display: $localize`Local`, Icon: null },
};

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
  #dupServer = inject(DuplicatiServerService);
  #statusBarState = inject(StatusBarState);
  #backupsState = inject(BackupsState);

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  sortOrderOptions = this.#backupsState.orderByOptions;
  orderBy = this.#backupsState.orderBy;
  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;
  startingBackup = this.#backupsState.startingBackup;
  deletingBackup = this.#backupsState.deletingBackup;

  timeType = this.#backupsState.timeType;

  viewMode = localStorageSignal<'list' | 'details'>('viewMode', 'list');

  sortByColumn = signal<OrderBy | null>(this.#backupsState.orderBy());
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
    this.#statusBarState.resumeDialogCheck(() => this.#backupsState.startBackup(id));
  }

  getBackendIcon(targetUrl: string | null | undefined) {
    if (!targetUrl) return '';
    const backend = targetUrl.split('://')[0];
    const match = getConfigurationByKey(backend);
    const override = DestinationOverrides[match.key];
    return override?.Icon ?? 'database';
  }

  getBackendType(targetUrl: string | null | undefined) {
    if (!targetUrl) return '';
    const backend = targetUrl.split('://')[0];
    const match = getConfigurationByKey(backend);
    if (!match) return '';

    const override = DestinationOverrides[match.key];
    if (override?.Display) return override.Display;

    if (match.key === 's3') {
      const fakeHttpUrl = 'http://null?' + targetUrl.split('?')[1]; // simulate query string
      const url = new URL(fakeHttpUrl);
      const serverName = url.searchParams.get('s3-server-name')?.toLowerCase() ?? '';

      for (const [suffix, name] of Object.entries(S3_HOST_SUFFIX_MAP)) {
        if (serverName.endsWith(suffix)) {
          return name;
        }
      }
    }

    return match.displayName;
  }

  getBackupVersionCount(backup: BackupAndScheduleOutputDto | null): number {
    return parseInt(backup?.Backup?.Metadata?.['BackupListCount'] ?? '', 10) || 0;
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
