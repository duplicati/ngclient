import { computed, inject, Injectable, signal } from '@angular/core';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { defer, finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, UpdatePollerStates } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';
import { ServerStateService } from './server-state.service';

/**
 * The updater states that belong to an install started from the UI
 */
const INSTALL_STATES: UpdatePollerStates[] = ['Downloading', 'Verifying', 'LaunchingHelper', 'Installing'];

/**
 * Starts and cancels automatic update installs, and describes their progress
 */
@Injectable({
  providedIn: 'root',
})
export class UpdateInstallService {
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #serverState = inject(ServerStateService);
  #sysinfo = inject(SysinfoState);
  #confirmationPending = false;

  /**
   * True while the install or cancel request is being sent
   */
  requestPending = signal(false);

  updaterState = computed(() => this.#serverState.serverState()?.UpdaterState ?? 'Waiting');
  updatedVersion = computed(() => this.#serverState.serverState()?.UpdatedVersion ?? null);

  /**
   * True if the server can install updates on this installation
   */
  installSupported = computed(() => this.#sysinfo.systemInfo()?.UpdateInstallSupported === true);

  /**
   * Why the server cannot install updates, when it cannot
   */
  unsupportedReason = computed(() => this.#sysinfo.systemInfo()?.UpdateInstallUnsupportedReason ?? null);

  /**
   * True if an update is available and can be installed now
   */
  canInstall = computed(
    () =>
      this.installSupported() && !!this.updatedVersion() && this.updaterState() === 'Waiting' && !this.requestPending()
  );

  /**
   * True while an install runs
   */
  installing = computed(() => INSTALL_STATES.includes(this.updaterState()));

  /**
   * True while the install can still be cancelled; once the helper is told to go it cannot
   */
  canCancel = computed(() => this.installing() && this.updaterState() !== 'Installing' && !this.requestPending());

  /**
   * A description of the current install step
   */
  stateLabel = computed(() => {
    switch (this.updaterState()) {
      case 'Downloading':
        return $localize`Downloading update …`;
      case 'Verifying':
        return $localize`Verifying update …`;
      case 'LaunchingHelper':
        return $localize`Preparing the update installer …`;
      case 'Installing':
        return $localize`Duplicati is restarting to install the update. This page reconnects when it is back.`;
      default:
        return null;
    }
  });

  /**
   * Asks for confirmation and starts the install
   */
  install() {
    if (!this.canInstall() || this.#confirmationPending) return;
    const version = this.updatedVersion();
    if (!version) return;

    this.#confirmationPending = true;
    this.#dialog.open(ConfirmDialogComponent, {
      maxWidth: '550px',
      width: '100%',
      data: {
        title: $localize`Install update`,
        message: $localize`Duplicati will download ${version}:version:, stop and restart to install it. New backups will not start while the update is prepared. Continue?`,
        confirmText: $localize`Install update`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        this.#confirmationPending = false;
        if (!res || !this.canInstall() || this.updatedVersion() !== version) return;

        // Errors are reported by the HTTP interceptor
        this.requestPending.set(true);
        defer(() => this.#dupServer.postApiV1UpdatesInstall())
          .pipe(finalize(() => this.requestPending.set(false)))
          .subscribe({ error: () => {} });
      },
    });
  }

  /**
   * Cancels a running install, before the helper takes over
   */
  cancel() {
    if (!this.canCancel()) return;
    this.requestPending.set(true);
    defer(() => this.#dupServer.postApiV1UpdatesCancelInstall())
      .pipe(finalize(() => this.requestPending.set(false)))
      .subscribe({ error: () => {} });
  }
}
