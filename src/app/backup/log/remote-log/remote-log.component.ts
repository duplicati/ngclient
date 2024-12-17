import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { SparkleProgressBarComponent } from '@sparkle-ui/core';
import { map } from 'rxjs';
import { DuplicatiServerService } from '../../../core/openapi';

type Data = {
  Hash: string;
  Size: number;
};

type RemoteLogEntry = {
  ID: number;
  OperationID: number;
  Timestamp: number;
  Operation: string;
  Path: string;
  Data: string;
};

type RemoteLogEntryEvaluated = {
  id: number;
  operationId: number;
  timestamp: number;
  operation: string;
  path: string;
  data: Data;
};

@Component({
  selector: 'app-remote-log',
  imports: [JsonPipe, SparkleProgressBarComponent, DatePipe],
  templateUrl: './remote-log.component.html',
  styleUrl: './remote-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteLogComponent {
  #dupServer = inject(DuplicatiServerService);

  backupId = input.required<string>();

  openEntry = signal<number | null>(null);
  pagination = signal({
    offset: 0,
    pagesize: 100,
  });

  resource = rxResource({
    request: () => ({ id: this.backupId()!, ...this.pagination() }),
    loader: ({ request: params }) =>
      this.#dupServer.getApiV1BackupByIdRemotelog({ id: params.id }).pipe(
        map((x) => {
          return (x as RemoteLogEntry[]).map((y, i) => {
            const newItem = {
              id: y.ID,
              operationId: y.OperationID,
              timestamp: y.Timestamp,
              operation: y.Operation,
              path: y.Path,
              data: typeof y.Data === 'string' ? JSON.parse(y.Data) : null,
            } as RemoteLogEntryEvaluated;

            return newItem;
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
