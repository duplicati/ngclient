import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SparkleButtonComponent, SparkleIconComponent, SparkleProgressBarComponent } from '@sparkle-ui/core';
import { finalize, map } from 'rxjs';
import { DuplicatiServerService, UpdatesService } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';

@Component({
  selector: 'app-general',
  imports: [SparkleProgressBarComponent, SparkleButtonComponent, SparkleIconComponent, JsonPipe],
  templateUrl: './general.component.html',
  styleUrl: './general.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GeneralComponent {
  #dupServer = inject(DuplicatiServerService);
  #updates = inject(UpdatesService);
  #serverState = inject(ServerStateService);

  isLoading = signal(true);
  checkingForUpdates = signal(false);
  serverState = this.#serverState.serverState;
  duplicatiVersion = computed(() => this.#serverState.serverState()?.UpdatedVersion);
  generalInfo = toSignal(
    this.#dupServer.getApiV1Acknowledgements().pipe(
      map((x) => x.Acknowledgements), // ? this.#sanitizer.bypassSecurityTrustHtml(x.Acknowledgements) : '')),
      finalize(() => this.isLoading.set(false))
    )
  );

  checkForUpdates() {
    this.checkingForUpdates.set(true);

    this.#updates
      .postApiV1UpdatesCheck()
      .pipe(finalize(() => this.checkingForUpdates.set(false)))
      .subscribe();
  }
}
