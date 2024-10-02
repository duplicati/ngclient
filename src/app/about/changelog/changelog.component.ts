import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DuplicatiServerService } from '../../core/openapi';

@Component({
  selector: 'app-changelog',
  standalone: true,
  imports: [JsonPipe],
  templateUrl: './changelog.component.html',
  styleUrl: './changelog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ChangelogComponent {
  #dupServer = inject(DuplicatiServerService);

  changelog = toSignal(this.#dupServer.getApiV1Changelog());
}
