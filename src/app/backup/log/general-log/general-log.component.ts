import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  SparkleButtonComponent,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
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
    SparkleDividerComponent,
    SparkleProgressBarComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
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

  toggleOpenEntry(id: number) {
    if (this.openEntry() === id) {
      this.openEntry.set(null);
      return;
    }

    this.openEntry.set(id);
  }
}
