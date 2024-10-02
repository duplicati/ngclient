import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DuplicatiServerService } from '../../core/openapi';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [JsonPipe],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogsComponent {
  #dupServer = inject(DuplicatiServerService);

  logs = toSignal(this.#dupServer.getApiV1LogdataLog());
}
