import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { defer, finalize, Subscription } from 'rxjs';
import { DuplicatiServer, LogEntry, LogMessageType } from '../../../core/openapi';

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
  #dupServer = inject(DuplicatiServer);
  #logs = signal<LogEntry[]>([]);
  #request: Subscription | undefined;
  #pollingGeneration = 0;

  LOG_LEVELS = LOG_LEVELS;
  logLevel = signal('Disabled');
  logLevelByLabel = computed(() => LOG_LEVELS.find((level) => level.value === this.logLevel())?.label);

  whenFilter = signal<number | null>(null);
  backupIdFilter = signal<string | null>(null);
  id = signal<number>(0);
  logs = computed(() => {
    if (this.whenFilter() && this.backupIdFilter()) {
      return this.#logs().filter(
        (x) =>
          x.BackupID === this.backupIdFilter() &&
          new Date(x.When!).getTime() >= this.whenFilter()! &&
          x.BackupID === this.backupIdFilter()
      );
    }

    return this.#logs();
  });
  timerInterval: number | undefined;
  logsLoading = signal(false);
  isPolling = signal(false);
  pagination = signal({
    offset: 0,
    pagesize: 100,
  });

  logLevelEffect = effect(() => {
    if (this.isPolling()) {
      this.#logs.set([]);
      this.id.set(0);
      const generation = ++this.#pollingGeneration;
      queueMicrotask(() => {
        if (generation === this.#pollingGeneration && this.isPolling()) this.loadLogs();
      });
      this.timerInterval && clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        this.loadLogs();
      }, 3000);
    } else {
      this.clearPolling();
    }
  });

  setWhenFilter(whenFilter: number | null) {
    this.whenFilter.set(whenFilter);
  }

  setBackupIdFilter(backupIdFilter: string | null) {
    this.backupIdFilter.set(backupIdFilter);
  }

  loadLogs() {
    // The server rejects polling at the disabled level
    if (this.logLevel() === 'Disabled' || this.#request) return;

    // Register before subscribing so synchronous completion also releases the guard.
    const request = new Subscription();
    this.#request = request;
    this.logsLoading.set(true);

    request.add(
      defer(() =>
        this.#dupServer.getApiV1LogdataPoll({
          query: {
            id: this.id(),
            level: this.logLevel() as LogMessageType,
            pagesize: this.pagination().pagesize,
          },
        })
      )
        .pipe(
          finalize(() => {
            if (this.#request === request) {
              this.#request = undefined;
              this.logsLoading.set(false);
            }
          })
        )
        .subscribe({
          next: (res) => {
            const reversedItems = res.reverse() as LogEntry[];
            const newId = this.#getHighestId(reversedItems);
            newId > 0 && this.id.set(newId);
            this.#logs.set([...reversedItems, ...this.#logs()]);
          },
          // HTTP errors are reported by the interceptor; leave the next poll available.
          error: () => {},
        })
    );
  }

  updateLogLevel(logLevel: string) {
    this.logLevel.set(logLevel);

    if (logLevel === 'Disabled') {
      this.clearPolling();
    }
  }

  #getHighestId(items: LogEntry[]) {
    return items.reduce((acc, cur) => Math.max(acc, cur.ID!), 0);
  }

  destroy() {
    this.logLevel.set('Disabled');
    this.clearPolling();
  }

  clearPolling() {
    ++this.#pollingGeneration;
    this.timerInterval && clearInterval(this.timerInterval);
    this.timerInterval = undefined;
    this.#request?.unsubscribe();
  }
}
