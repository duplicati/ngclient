import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ShipButton,
  ShipButtonGroup,
  ShipCard,
  ShipChip,
  ShipDivider,
  ShipIcon,
  ShipMenu,
  ShipProgressBar,
  ShipSort,
  ShipTable,
} from '@ship-ui/core';
import { finalize } from 'rxjs';
import { S3_HOST_SUFFIX_MAP } from '../backup/destination/destination.config';
import { getConfigurationByUrl } from '../backup/destination/destination.config-utilities';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { BackupAndScheduleOutputDto, DuplicatiServer } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { Backup, BackupsState, OrderBy, TimeType } from '../core/states/backups.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';

const DestinationOverrides: Record<string, { Display: string | null; Icon: string | null }> = {
  file: { Display: $localize`Local`, Icon: null },
};

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    StatusBarComponent,
    ShipCard,
    ShipButton,
    ShipIcon,
    ShipChip,
    ShipDivider,
    ShipMenu,
    ShipProgressBar,
    ShipButtonGroup,
    ShipTable,
    ShipSort,
    DurationFormatPipe,
    BytesPipe,
    RelativeTimePipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomeComponent {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);
  #backupsState = inject(BackupsState);
  #remoteControlState = inject(RemoteControlState);

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

  openInConsole(backup: Backup) {
    const externalId = backup.Backup.ExternalID?.split(':')[1];

    if (!externalId) {
      console.error('Backup does not have an external ID');
      return;
    }

    this.#remoteControlState.openConsole('/app/machines/configurations/' + externalId);
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
    const match = getConfigurationByUrl(targetUrl);
    return match.icon ?? 'database';
  }

  getBackendType(targetUrl: string | null | undefined) {
    if (!targetUrl) return '';
    const match = getConfigurationByUrl(targetUrl);
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
}
