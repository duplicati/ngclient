import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService, LogEntry, LogMessageType } from '../../../core/openapi';

type LogLevel = {
  value: LogMessageType | 'Disabled';
  label: string;
};
const LOG_LEVELS: LogLevel[] = [
  {
    value: 'Disabled',
    label: $localize`Disabled`,
  },
  {
    value: 'Verbose',
    label: $localize`Verbose`,
  },
  {
    value: 'ExplicitOnly',
    label: $localize`Explicit only`,
  },
  {
    value: 'Profiling',
    label: $localize`Profiling`,
  },
  {
    value: 'Retry',
    label: $localize`Retry`,
  },
  {
    value: 'Information',
    label: $localize`Information`,
  },
  {
    value: 'DryRun',
    label: $localize`Dry run`,
  },
  {
    value: 'Warning',
    label: $localize`Warning`,
  },
  {
    value: 'Error',
    label: $localize`Error`,
  },
];

@Injectable({
  providedIn: 'root',
})
export class LogsLiveState {
  #dupServer = inject(DuplicatiServerService);

  LOG_LEVELS = LOG_LEVELS;
  logLevel = signal('Disabled');
  logLevelByLabel = computed(() => LOG_LEVELS.find((level) => level.value === this.logLevel())?.label);

  id = signal<number>(0);
  logs = signal<LogEntry[]>([]);
  timerInterval: number | undefined;
  logsLoading = signal(false);
  pagination = signal({
    offset: 0,
    pagesize: 100,
  });

  logLevelEffect = effect(() => {
    if (this.logLevel() === 'Disabled') {
      this.timerInterval = undefined;
    } else {
      this.logs.set([]);
      this.id.set(0);
      queueMicrotask(() => this.loadLogs());
      this.timerInterval && clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        this.loadLogs();
      }, 3000);
    }
  });

  loadLogs() {
    this.logsLoading.set(true);

    this.#dupServer
      .getApiV1LogdataPoll({
        id: this.id(),
        level: this.logLevel() as LogMessageType,
        pagesize: this.pagination().pagesize,
      })
      .pipe(finalize(() => this.logsLoading.set(false)))
      .subscribe({
        next: (res) => {
          const reversedItems = res.reverse() as LogEntry[];
          const newId = this.#getHighestId(reversedItems);
          newId > 0 && this.id.set(newId);
          this.logs.set([...reversedItems, ...this.logs()]);
        },
      });
  }

  updateLogLevel(logLevel: string) {
    this.logLevel.set(logLevel);
  }

  #getHighestId(items: LogEntry[]) {
    return items.reduce((acc, cur) => Math.max(acc, cur.ID!), 0);
  }

  destroy() {
    this.logLevel.set('Disabled');
    this.timerInterval && clearInterval(this.timerInterval);
  }
}
