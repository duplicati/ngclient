import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ShipButtonComponent, ShipIconComponent, ShipProgressBarComponent } from '@ship-ui/core';
import { finalize, map } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { SysinfoState } from '../../core/states/sysinfo.state';

@Component({
  selector: 'app-general',
  imports: [ShipProgressBarComponent, ShipButtonComponent, ShipIconComponent],
  templateUrl: './general.component.html',
  styleUrl: './general.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GeneralComponent {
  #dupServer = inject(DuplicatiServer);
  #serverState = inject(ServerStateService);
  #sysinfo = inject(SysinfoState);

  isLoading = signal(true);
  checkingForUpdates = signal(false);
  serverState = this.#serverState.serverState;
  duplicatiVersion = computed(() => this.#sysinfo.systemInfo()?.ServerVersionName ?? 'Unknown');
  generalInfo = toSignal(
    this.#dupServer.getApiV1Acknowledgements().pipe(
      map((x) => x.Acknowledgements), // ? this.#sanitizer.bypassSecurityTrustHtml(x.Acknowledgements) : '')),
      finalize(() => this.isLoading.set(false))
    )
  );

  checkForUpdates() {
    this.checkingForUpdates.set(true);

    this.#dupServer
      .postApiV1UpdatesCheck()
      .pipe(finalize(() => this.checkingForUpdates.set(false)))
      .subscribe();
  }
}
