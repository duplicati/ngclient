import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SparkleIconComponent, SparkleTableComponent } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';

const COLUMNS = ['BackupID', 'Timestamp', 'Message', 'actions'] as const;

type LogEvent = {
  BackupID: number;
  Timestamp: string;
  Message: string;
  Exception: string;
};

@Component({
  selector: 'app-logs',
  imports: [SparkleTableComponent, DatePipe, SparkleIconComponent],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogsComponent {
  #dupServer = inject(DuplicatiServerService);

  displayedColumns = signal(COLUMNS);
  logsLoading = signal(true);
  openRowIndex = signal<number | null>(null);
  logs = signal<LogEvent[]>([]);

  ngOnInit() {
    this.init();
  }

  init() {
    this.#dupServer
      .getApiV1LogdataLog()
      .pipe(finalize(() => this.logsLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.logs.set(res as LogEvent[]);
        },
      });
  }

  toggleRow(index: number) {
    this.openRowIndex.set(index === this.openRowIndex() ? null : index);
  }

  breakIntoLines(str: string | null): string[] {
    if (!str)
      return [];

    return str.split('\n');
  }
}
