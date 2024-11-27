import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { SparkleProgressBarComponent } from '@sparkle-ui/core';
import { finalize, map } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';

@Component({
    selector: 'app-general',
    imports: [JsonPipe, SparkleProgressBarComponent],
    templateUrl: './general.component.html',
    styleUrl: './general.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export default class GeneralComponent {
  #sanitizer = inject(DomSanitizer);
  #dupServer = inject(DuplicatiServerService);

  isLoading = signal(true);
  generalInfo = toSignal(
    this.#dupServer.getApiV1Acknowledgements().pipe(
      map((x) =>
        x.Acknowledgements ? this.#sanitizer.bypassSecurityTrustHtml(x.Acknowledgements.replace(/\r/g, '\n')) : ''
      ),
      finalize(() => this.isLoading.set(false))
    )
  );
}
