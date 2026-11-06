import { DatePipe, JsonPipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDivider } from '@ship-ui/core/ship-divider';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipToggleCard } from '@ship-ui/core/ship-toggle-card';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { defer, finalize, map, switchMap } from 'rxjs';
import { DuplicatiServer, SettingDto, SettingInputDto } from '../../../core/openapi';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../../../core/pipes/duration.pipe';
import { BackupsState } from '../../../core/states/backups.state';
import { LogLevel, ParsedLogLine, parseLogLine } from '../log-line';
import { BackupResult, SyncResult } from '../log.types';

/** Icon and label for each log level, shown on the log line rows */
export const LOG_LEVEL_DISPLAY: Record<LogLevel, { icon: string; label: string }> = {
  information: { icon: 'info', label: $localize`Information` },
  warning: { icon: 'warning', label: $localize`Warning` },
  error: { icon: 'x-circle', label: $localize`Error` },
  retry: { icon: 'arrow-clockwise', label: $localize`Retry` },
  verbose: { icon: 'circle-dashed', label: $localize`Verbose` },
  profiling: { icon: 'circle-dashed', label: $localize`Profiling` },
  dryrun: { icon: 'circle-dashed', label: $localize`Dry run` },
  unknown: { icon: 'dots-three-circle', label: $localize`Unknown level` },
};

/** Human readable names for the restore test enums, keyed by the value the server serializes */
const RESTORE_TEST_MODE_LABELS: Record<string, string> = {
  RandomFiles: $localize`Random files`,
  RandomSize: $localize`Random files up to a size`,
  Full: $localize`All files`,
  Rolling: $localize`Rolling, least recently verified first`,
};

const RESTORE_TEST_FAILURE_LABELS: Record<string, string> = {
  HashMismatch: $localize`Content hash mismatch`,
  SizeMismatch: $localize`Size mismatch`,
  MissingRemoteVolume: $localize`Remote volume missing or damaged`,
  RestoreError: $localize`Restore failed`,
  MetadataMismatch: $localize`Metadata mismatch`,
};

const RESTORE_TEST_BUDGET_LABELS: Record<string, string> = {
  DownloadSize: $localize`download size budget exceeded`,
  Runtime: $localize`runtime budget exceeded`,
};

type ParsedLogLines = {
  messages: ParsedLogLine[];
  warnings: ParsedLogLine[];
  errors: ParsedLogLine[];
};

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
  // Exactly one of data (parsed Result rows) or rawMessage (everything else) is set
  data?: BackupResult & Partial<SyncResult>;
  rawMessage?: string;
  exception: unknown;
  // The Warnings and Errors of data, of the restore test and of each secondary destination, split into time, level, tag and message
  logLines?: ParsedLogLines & { sync: ParsedLogLines[]; restoreTest?: ParsedLogLines };
};

type LogPagination = {
  offset: number | undefined;
  pagesize: number;
  previousOffsets: Array<number | undefined>;
};

function parseLogLines(result: { Messages?: string[] | null; Warnings?: string[] | null; Errors?: string[] | null }) {
  return {
    messages: (result.Messages ?? []).map((line) => parseLogLine(line, 'information')),
    warnings: (result.Warnings ?? []).map((line) => parseLogLine(line, 'warning')),
    errors: (result.Errors ?? []).map((line) => parseLogLine(line, 'error')),
  };
}

@Component({
  selector: 'app-general-log',
  imports: [
    ShipToggleCard,
    ShipDivider,
    ShipProgressBar,
    ShipButton,
    ShipIcon,
    ShipTooltip,
    BytesPipe,
    DatePipe,
    DurationFormatPipe,
    JsonPipe,
    NgTemplateOutlet,
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
  pagination = linkedSignal({
    source: this.backupId,
    computation: (): LogPagination => ({ offset: undefined, pagesize: 100, previousOffsets: [] }),
  });
  isSuppressingWarning = signal(false);
  copied = linkedSignal({ source: this.pagination, computation: (): string | null => null });

  // Resource to fetch backup data for checking suppressed warnings
  backupResource = resource({
    params: () => ({ id: this.backupId() }),
    loader: ({ params }) => this.#dupServer.getApiV1BackupById({ path: { id: params.id } }),
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

  openEntry = linkedSignal({ source: this.pagination, computation: (): number | null => null });
  // Keys of the log line rows the user has expanded, cleared when another entry is opened
  expandedLogLines = linkedSignal({
    source: this.pagination,
    computation: (): ReadonlySet<string> => new Set(),
  });
  openSection = linkedSignal({ source: this.pagination, computation: (): 'errors' | 'warnings' | null => null });

  resource = rxResource({
    params: () => ({ id: this.backupId(), offset: this.pagination().offset, pagesize: this.pagination().pagesize }),
    stream: ({ params }) =>
      defer(() =>
        this.#dupServer.getApiV1BackupByIdLog({
          path: { id: params.id },
          query: { offset: params.offset, pagesize: params.pagesize },
        })
      ).pipe(
        map((x) => {
          return (x as LogEntry[]).map((y): LogEntryEvaluated => {
            let data: LogEntryEvaluated['data'] | undefined;
            if (y.Type === 'Result') {
              try {
                const parsed = JSON.parse(y.Message);
                if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
              } catch {
                // Preserve old or unstructured rows without failing the whole page.
              }
            }
            return {
              id: y.ID,
              operationId: y.OperationID,
              timestamp: y.Timestamp * 1000,
              type: y.Type,
              data,
              logLines: data && {
                ...parseLogLines(data),
                sync: (data.RemoteSynchronizationResults ?? []).map(parseLogLines),
                restoreTest: data.RestoreTestResults ? parseLogLines(data.RestoreTestResults) : undefined,
              },
              rawMessage: data === undefined ? y.Message : undefined,
              exception: JSON.stringify(y.Exception) === '{}' ? null : y.Exception,
            };
          });
        })
      ),
  });

  // The API's offset is an exclusive ID cursor, not a row count or timestamp.
  #olderOffset = computed(() => {
    if (!this.resource.hasValue()) return undefined;
    const entries = this.resource.value();
    const page = this.pagination();
    const offset = entries.at(-1)?.id;
    if (entries.length < page.pagesize || offset === undefined || offset <= 0) return undefined;
    if (page.offset !== undefined && offset >= page.offset) return undefined;
    return offset;
  });
  hasOlderEntries = computed(() => !this.resource.isLoading() && this.#olderOffset() !== undefined);
  hasNewerEntries = computed(() => !this.resource.isLoading() && this.pagination().previousOffsets.length > 0);

  loadOlder() {
    const offset = this.#olderOffset();
    if (this.resource.isLoading() || offset === undefined) return;
    this.pagination.update((page) => ({
      ...page,
      offset,
      previousOffsets: [...page.previousOffsets, page.offset],
    }));
  }

  loadNewer() {
    if (!this.hasNewerEntries()) return;
    this.pagination.update((page) => ({
      ...page,
      offset: page.previousOffsets.at(-1),
      previousOffsets: page.previousOffsets.slice(0, -1),
    }));
  }

  getLocalizedSummary(item: LogEntryEvaluated): string {
    const errorCount = item.data?.ErrorsActualLength ?? 0;
    const warningCount = item.data?.WarningsActualLength ?? 0;

    const summary = [];

    if (item.data?.MainOperation == 'Sync') {
      if (item.data?.Duration) summary.push($localize`took ${this.#shortDuration(item.data.Duration)}`);
      if (item.data?.FilesUploaded)
        summary.push(
          $localize`uploaded ${item.data.FilesUploaded} file(s) (${this.#sizePipe.transform(item.data.SizeOfUploadedFiles)})`
        );
      if (item.data?.FilesDeleted) summary.push($localize`deleted ${item.data.FilesDeleted} file(s)`);
    }

    if (item.data?.MainOperation == 'Backup') {
      if (item.data?.Duration) summary.push($localize`took ${this.#shortDuration(item.data.Duration)}`);
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

  #shortDuration(duration: string): string {
    let durationString = this.#durationPipe.transform(duration, true) as string;
    if (durationString.startsWith('0h ')) durationString = durationString.slice(3);
    if (durationString.startsWith('0m ')) durationString = durationString.slice(3);
    return durationString;
  }

  restoreTestModeLabel(mode: string | undefined): string {
    return (mode && RESTORE_TEST_MODE_LABELS[mode]) || mode || '';
  }

  restoreTestFailureLabel(reason: string | undefined): string {
    return (reason && RESTORE_TEST_FAILURE_LABELS[reason]) || reason || '';
  }

  restoreTestBudgetLabel(reason: string | undefined): string {
    return (reason && RESTORE_TEST_BUDGET_LABELS[reason]) || reason || '';
  }

  getStatusClass(item: LogEntryEvaluated): string {
    // Raw rows have no ParsedResult, so fall back to the row type and never show them as successful
    const status = item.data ? item.data.ParsedResult : item.type;
    if (status === 'Fatal' || status === 'Error') return 'error';
    if (status === 'Warning') return 'warn';
    return item.data ? '' : 'unknown';
  }

  toggleOpenEntry(item: LogEntryEvaluated) {
    const id = item.id;
    this.expandedLogLines.set(new Set());
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

  // Typed accessor for the template, whose row context is untyped
  logLevelDisplay(line: ParsedLogLine) {
    return LOG_LEVEL_DISPLAY[line.level];
  }

  toggleLogLine(key: string) {
    this.expandedLogLines.update((expanded) => {
      const next = new Set(expanded);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  isWarningSuppressed(messageId: string): boolean {
    return this.suppressedWarningIds().has(messageId);
  }

  toggleWarningSuppression(messageId: string) {
    const backupId = this.backupId();
    if (!backupId || !messageId) return;

    this.isSuppressingWarning.set(true);

    // First get the current backup to retrieve existing settings
    defer(() => this.#dupServer.getApiV1BackupById({ path: { id: backupId } }))
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
            path: { id: backupId },
            body: {
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

  formatException(exception: unknown): string {
    return typeof exception === 'string' ? exception : this.stringify(exception);
  }

  stringify(obj: any) {
    return JSON.stringify(obj, null, 2);
  }
}
