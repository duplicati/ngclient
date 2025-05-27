import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { SparkleButtonComponent, SparkleIconComponent, SparkleTableComponent } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../../core/openapi';

const COLUMNS = ['BackupID', 'Timestamp', 'Message', 'actions'] as const;

type LogEvent = {
  BackupID: number;
  Timestamp: number;
  Message: string;
  Exception: string;
};

type Pagination = {
  offsetTime: number | undefined;
  pagesize: number;
};

@Component({
  selector: 'app-logs-stored',
  imports: [SparkleTableComponent, DatePipe, SparkleIconComponent, SparkleButtonComponent],
  templateUrl: './logs-stored.component.html',
  styleUrl: './logs-stored.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogsStoredComponent {
  #dupServer = inject(DuplicatiServerService);

  displayedColumns = signal(COLUMNS);
  openRowIndex = signal<number | null>(null);

  noMoreItems = signal(false);
  logsIsLoading = signal(false);
  logs = signal<LogEvent[]>([]);
  pagination = signal<Pagination>({
    offsetTime: undefined,
    pagesize: 10,
  });

  paginationEffect = effect(() => {
    const _ = this.pagination();
    this.getLogs();
  });

  ngOnInit() {
    this.getLogs();
  }

  getLogs() {
    this.logsIsLoading.set(true);

    const pagination = this.pagination();

    this.#dupServer
      .getApiV1LogdataLog({
        pagesize: pagination.pagesize,
        offset: pagination.offsetTime,
      })
      .pipe(finalize(() => this.logsIsLoading.set(false)))
      .subscribe({
        next: (res) => {
          if (res.length === 0) this.noMoreItems.set(true);
          this.logs.update((x) => [...x, ...(res as LogEvent[])]);
        },
      });
  }

  toggleRow(index: number) {
    this.openRowIndex.set(index === this.openRowIndex() ? null : index);
  }

  breakIntoLines(str: string | null): string[] {
    if (!str) return [];

    return str.split('\n');
  }

  loadMore() {
    const offsetTime = this.logs().at(-1)?.Timestamp;
    this.pagination.update((x) => ({ ...x, offsetTime: offsetTime }) as Pagination);
  }
}
