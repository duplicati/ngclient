import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { defer, finalize, map } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { UpdateInstallService } from '../../core/services/update-install.service';
import { SysinfoState } from '../../core/states/sysinfo.state';

@Component({
  selector: 'app-general',
  imports: [ShipProgressBar, ShipButton, ShipIcon],
  templateUrl: './general.component.html',
  styleUrl: './general.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GeneralComponent {
  #destroyRef = inject(DestroyRef);
  #dupServer = inject(DuplicatiServer);
  #serverState = inject(ServerStateService);
  #sysinfo = inject(SysinfoState);
  updateInstall = inject(UpdateInstallService);

  isLoading = signal(true);
  checkingForUpdates = signal(false);
  serverState = this.#serverState.serverState;
  duplicatiVersion = computed(() => this.#sysinfo.systemInfo()?.ServerVersionName ?? 'Unknown');
  generalInfo = toSignal(
    defer(() => this.#dupServer.getApiV1Acknowledgements()).pipe(
      map((x) => x.Acknowledgements), // ? this.#sanitizer.bypassSecurityTrustHtml(x.Acknowledgements) : '')),
      finalize(() => this.isLoading.set(false))
    )
  );

  checkForUpdates() {
    if (this.#destroyRef.destroyed || this.checkingForUpdates() || this.serverState()?.UpdaterState === 'Checking')
      return;

    this.checkingForUpdates.set(true);

    defer(() => this.#dupServer.postApiV1UpdatesCheck())
      .pipe(
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => this.checkingForUpdates.set(false))
      )
      // HTTP errors are presented by the interceptor; allow a later retry.
      .subscribe({ error: () => {} });
  }
}
