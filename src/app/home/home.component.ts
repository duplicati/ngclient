import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { BackupsState, OrderBy } from '../core/states/backups.state';

const ORDER_BY_MAP = [
  {
    value: 'id',
    label: $localize`Create order`,
  },
  {
    value: 'backend',
    label: $localize`Destination type`,
  },
  {
    value: 'lastrun',
    label: $localize`Last run`,
  },
  {
    value: 'name',
    label: $localize`Name`,
  },
] as const;

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
  #dupServer = inject(DuplicatiServerService);

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  orderBy = computed(() => ORDER_BY_MAP.find((x) => x.value === this.#backupsState.orderBy())?.label);
  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;
  startingBackup = this.#backupsState.startingBackup;
  deletingBackup = this.#backupsState.deletingBackup;

  timeType = signal<'relative' | 'actual'>('relative');

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  setOrderBy(orderBy: OrderBy) {
    this.#backupsState.setOrderBy(orderBy);
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
