import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ShipButton, ShipDivider, ShipIcon, ShipProgressBar, ShipToggleCard } from '@ship-ui/core';
import { finalize, firstValueFrom, map, switchMap } from 'rxjs';
import { DuplicatiServer, SettingDto, SettingInputDto } from '../../../core/openapi';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../../../core/pipes/duration.pipe';
import { BackupsState } from '../../../core/states/backups.state';
import { BackupResult } from '../log.types';

interface WarningItem {
  Message?: string;
  Type?: string;
  Timestamp?: string;
  LogLevel?: string;
  Source?: string;
  MessageId?: string;
}

type LogEntry = {
  ID: number;
  OperationID: number;
  Timestamp: number;
  Type: string;
  Message: string;
  Exception: unknown;
};

type LogEntryEvaluated = {
  id: number;
  operationId: number;
  timestamp: number;
  type: string;
  data: BackupResult;
  exception: unknown;
};

@Component({
  selector: 'app-general-log',
  imports: [
    ShipToggleCard,
    ShipDivider,
    ShipProgressBar,
    ShipButton,
    ShipIcon,
    BytesPipe,
    DatePipe,
    DurationFormatPipe,
    JsonPipe,
  ],
  templateUrl: './general-log.component.html',
  styleUrl: './general-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeneralLogComponent {
  #dupServer = inject(DuplicatiServer);
  #backupsState = inject(BackupsState);
  #sizePipe = new BytesPipe();
  #durationPipe = new DurationFormatPipe();

  backupId = input.required<string>();
  isSuppressingWarning = signal(false);
  copied = signal<string | null>(null);

  // Resource to fetch backup data for checking suppressed warnings
  backupResource = resource({
    params: () => ({ id: this.backupId() }),
    loader: ({ params }) => firstValueFrom(this.#dupServer.getApiV1BackupById({ id: params.id })),
  });

  // Computed signal to get the set of suppressed warning IDs
  suppressedWarningIds = computed(() => {
    const backup = this.backupResource.value();
    if (!backup?.Backup?.Settings) return new Set<string>();

    const suppressSetting = backup.Backup.Settings.find((s: SettingDto) => s.Name === '--suppress-warnings');
    if (!suppressSetting?.Value) return new Set<string>();

    return new Set(
      suppressSetting.Value.split(',')
        .map((id: string) => id.trim())
        .filter(Boolean)
    );
  });

  openEntry = signal<number | null>(null);
  openSection = signal<'errors' | 'warnings' | null>(null);
  pagination = signal({
    offset: 0,
    pagesize: 100,
  });

  resource = rxResource({
    params: () => ({ id: this.backupId()!, ...this.pagination() }),
    stream: ({ params }) =>
      this.#dupServer.getApiV1BackupByIdLog({ id: params.id, pagesize: 100 }).pipe(
        map((x) => {
          return (x as LogEntry[]).map((y) => {
            return {
              id: y.ID,
              operationId: y.OperationID,
              timestamp: y.Timestamp * 1000,
              type: y.Type,
              data: JSON.parse(y.Message),
              exception: JSON.stringify(y.Exception) === '{}' ? null : y.Exception,
            } as Partial<LogEntryEvaluated>;
          });
        })
      ),
  });

  getLocalizedSummary(item: Partial<LogEntryEvaluated>): string {
    const errorCount = item.data?.ErrorsActualLength ?? 0;
    const warningCount = item.data?.WarningsActualLength ?? 0;

    const summary = [];

    if (item.data?.MainOperation == 'Backup') {
      if (item.data?.Duration) {
        let durationString = this.#durationPipe.transform(item.data?.Duration, true) as string;
        if (durationString.startsWith('0h ')) durationString = durationString.slice(3);
        if (durationString.startsWith('0m ')) durationString = durationString.slice(3);

        summary.push($localize`took ${durationString}`);
      }
      if (item.data?.BackendStatistics?.BytesUploaded)
        summary.push($localize`uploaded ${this.#sizePipe.transform(item.data?.BackendStatistics?.BytesUploaded)}`);
      if (item.data?.BackendStatistics?.KnownFileSize)
        summary.push($localize`backup size ${this.#sizePipe.transform(item.data?.BackendStatistics?.KnownFileSize)}`);
    }

    if (errorCount !== 0) summary.push($localize`:@@errorCount:${errorCount} error${errorCount === 1 ? '' : 's'}`);

    if (warningCount !== 0)
      summary.push($localize`:@@warningCount:${warningCount} warning${warningCount === 1 ? '' : 's'}`);

    if (summary.length === 0) return '';

    return `(${summary.join(', ')})`;
  }

  toggleOpenEntry(item: Partial<LogEntryEvaluated>) {
    const id = item.id!;
    if (this.openEntry() === id) {
      this.openEntry.set(null);
      this.openSection.set(null);
      return;
    }

    // Determine which section to auto-open based on errors/warnings
    const errorCount = item.data?.ErrorsActualLength ?? 0;
    const warningCount = item.data?.WarningsActualLength ?? 0;

    if (errorCount > 0) {
      this.openSection.set('errors');
    } else if (warningCount > 0) {
      this.openSection.set('warnings');
    } else {
      this.openSection.set(null);
    }

    this.openEntry.set(id);
  }

  parseWarning(warning: string): WarningItem | null {
    // Parse non-JSON format: "<timestamp> - [<LogLevel>-<Source>-<MessageId>]: <message>"
    const match = warning.match(/^(.*?) - \[(.*?)-(.*?)-(.*?)\]: (.*)$/);
    if (!match) return null;
    const [, timestamp, logLevel, source, messageId, message] = match;
    return {
      Timestamp: timestamp,
      LogLevel: logLevel,
      Source: source,
      MessageId: messageId,
      Message: message,
    };
  }

  isWarningSuppressed(messageId: string): boolean {
    return this.suppressedWarningIds().has(messageId);
  }

  toggleWarningSuppression(messageId: string) {
    const backupId = this.backupId();
    if (!backupId || !messageId) return;

    this.isSuppressingWarning.set(true);

    // First get the current backup to retrieve existing settings
    this.#dupServer
      .getApiV1BackupById({ id: backupId })
      .pipe(
        switchMap((backup) => {
          const currentSettings = backup.Backup?.Settings ?? [];

          // Find existing --suppress-warnings setting
          const suppressSettingIndex = currentSettings.findIndex((s) => s.Name === '--suppress-warnings');

          const isCurrentlySuppressed = this.isWarningSuppressed(messageId);
          let newSuppressValue = '';

          if (suppressSettingIndex >= 0) {
            // Setting exists, either add or remove the messageId
            const existingValue = currentSettings[suppressSettingIndex].Value ?? '';
            let existingIds = existingValue
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean);

            if (isCurrentlySuppressed) {
              // Remove the messageId (un-suppress)
              existingIds = existingIds.filter((id) => id !== messageId);
            } else {
              // Add new messageId if not already present
              if (!existingIds.includes(messageId)) {
                existingIds.push(messageId);
              }
            }

            newSuppressValue = existingIds.join(',');
          } else if (!isCurrentlySuppressed) {
            // No setting exists and we want to suppress, create new
            newSuppressValue = messageId;
          }

          // Create the updated settings array
          const updatedSettings: SettingInputDto[] = currentSettings.map((s) => ({
            Name: s.Name,
            Value: s.Value,
            Filter: s.Filter,
          }));

          if (suppressSettingIndex >= 0) {
            if (newSuppressValue === '') {
              // Remove the setting entirely if no warnings are suppressed
              updatedSettings.splice(suppressSettingIndex, 1);
            } else {
              // Update existing setting
              updatedSettings[suppressSettingIndex] = {
                Name: '--suppress-warnings',
                Value: newSuppressValue,
                Filter: null,
              };
            }
          } else if (newSuppressValue !== '') {
            // Add new setting
            updatedSettings.push({
              Name: '--suppress-warnings',
              Value: newSuppressValue,
              Filter: null,
            });
          }

          // Update the backup with new settings
          return this.#dupServer.putApiV1BackupById({
            id: backupId,
            requestBody: {
              Backup: {
                Name: backup.Backup?.Name,
                Description: backup.Backup?.Description,
                DBPath: backup.Backup?.DBPath,
                Tags: backup.Backup?.Tags ?? [],
                TargetURL: backup.Backup?.TargetURL,
                ConnectionStringID: backup.Backup?.ConnectionStringID,
                Sources: backup.Backup?.Sources ?? [],
                Settings: updatedSettings,
                Filters: backup.Backup?.Filters?.map((f) => ({
                  Expression: f.Expression,
                  Include: f.Include,
                  Order: f.Order,
                })) as any,
                Metadata: backup.Backup?.Metadata ?? {},
                AdditionalTargetURLs: backup.Backup?.AdditionalTargetURLs?.map((t) => ({
                  TargetUrl: t.TargetUrl,
                  UrlKey: t.UrlKey,
                  Mode: t.Mode,
                  Interval: t.Interval,
                  ConnectionStringID: t.ConnectionStringID,
                  Options: t.Options,
                })),
              },
              Schedule: backup.Schedule
                ? {
                    Repeat: backup.Schedule.Repeat,
                    Time: backup.Schedule.Time,
                    AllowedDays: backup.Schedule.AllowedDays,
                  }
                : undefined,
            },
          });
        }),
        finalize(() => this.isSuppressingWarning.set(false))
      )
      .subscribe({
        next: () => {
          // Refresh the backup state and reload backup data
          this.#backupsState.getBackups(true);
          this.backupResource.reload();
        },
        error: (err) => {
          console.error('Failed to toggle warning suppression:', err);
        },
      });
  }

  copyToClipboard($event: Event, text: string, id: string) {
    $event.stopPropagation();
    navigator.clipboard.writeText(text);
    this.copied.set(id);

    setTimeout(() => {
      this.copied.set(null);
    }, 2000);
  }

  stringify(obj: any) {
    return JSON.stringify(obj, null, 2);
  }
}
