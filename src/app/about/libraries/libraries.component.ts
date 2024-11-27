import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DuplicatiServerService } from '../../core/openapi';

@Component({
    selector: 'app-libraries',
    imports: [JsonPipe],
    templateUrl: './libraries.component.html',
    styleUrl: './libraries.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export default class LibrariesComponent {
  #dupServer = inject(DuplicatiServerService);

  licenses = toSignal(this.#dupServer.getApiV1Licenses());
}
