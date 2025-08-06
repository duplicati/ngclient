import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
    ShipButtonComponent,
    ShipDividerComponent,
    ShipIconComponent,
    ShipProgressBarComponent,
} from '@ship-ui/core';
import { map } from 'rxjs';
import ToggleCardComponent from '../../../core/components/toggle-card/toggle-card.component';
import { DuplicatiServerService } from '../../../core/openapi';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../../../core/pipes/duration.pipe';
import { BackupResult } from '../log.types';

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
    ToggleCardComponent,
    ShipDividerComponent,
    ShipProgressBarComponent,
    ShipButtonComponent,
    ShipIconComponent,
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
  #dupServer = inject(DuplicatiServerService);
  #sizePipe = new BytesPipe();
  #durationPipe = new DurationFormatPipe();

  backupId = input.required<string>();

  openEntry = signal<number | null>(null);
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
        if (durationString.startsWith('0h '))
          durationString = durationString.slice(3); 
        if (durationString.startsWith('0m '))
          durationString = durationString.slice(3);

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

  toggleOpenEntry(id: number) {
    if (this.openEntry() === id) {
      this.openEntry.set(null);
      return;
    }

    this.openEntry.set(id);
  }
}
