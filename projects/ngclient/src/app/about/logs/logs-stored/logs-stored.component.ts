import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipTable } from '@ship-ui/core/ship-table';
import { defer, finalize } from 'rxjs';
import { DuplicatiServer } from '../../../core/openapi';

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
  imports: [ShipTable, DatePipe, ShipIcon, ShipButton],
  templateUrl: './logs-stored.component.html',
  styleUrl: './logs-stored.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogsStoredComponent {
  #dupServer = inject(DuplicatiServer);
  #destroyRef = inject(DestroyRef);

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

  getLogs() {
    if (this.#destroyRef.destroyed || this.logsIsLoading() || this.noMoreItems()) return;
    this.logsIsLoading.set(true);

    const pagination = this.pagination();

    defer(() =>
      this.#dupServer.getApiV1LogdataLog({
        query: {
          pagesize: pagination.pagesize,
          offset: pagination.offsetTime,
        },
      })
    )
      .pipe(
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => this.logsIsLoading.set(false))
      )
      .subscribe({
        next: (res) => {
          if (res.length === 0) this.noMoreItems.set(true);
          this.logs.update((x) => [...x, ...(res as LogEvent[])]);
        },
        // The interceptor presents the error; keep the cursor available for retry.
        error: () => {},
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
    if (this.logsIsLoading() || this.noMoreItems()) return;
    const offsetTime = this.logs().at(-1)?.Timestamp;
    this.pagination.update((x) => ({ ...x, offsetTime: offsetTime }) as Pagination);
  }
}
