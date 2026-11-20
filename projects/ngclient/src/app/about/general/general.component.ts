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

  // The finish time of the last check when this page started a check, undefined until it does.
  // The finish time changing tells that the check finished, also when the checking state was missed.
  #checkStartedAfter = signal<string | null | undefined>(undefined);

  // The result of the check started from this page. A server that does not report
  // the finish time never shows a result, as it cannot tell a failed check from no update.
  checkResult = computed<'error' | 'up-to-date' | null>(() => {
    const startedAfter = this.#checkStartedAfter();
    const state = this.serverState();
    const finished = state?.UpdateCheckFinished;
    if (startedAfter === undefined || state?.UpdaterState !== 'Waiting' || !finished || finished === startedAfter)
      return null;
    if (state.UpdateCheckError) return 'error';
    return state.UpdatedVersion ? null : 'up-to-date';
  });
  duplicatiVersion = computed(() => this.#sysinfo.systemInfo()?.ServerVersionName ?? 'Unknown');
  // Older servers do not report these, so the template leaves them out when missing
  databaseFieldsEncrypted = computed(() => this.#sysinfo.systemInfo()?.DatabaseFieldsEncrypted);
  preloadSettingsPaths = computed(() => this.#sysinfo.systemInfo()?.PreloadSettingsPaths ?? []);
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
    this.#checkStartedAfter.set(this.serverState()?.UpdateCheckFinished ?? null);

    defer(() => this.#dupServer.postApiV1UpdatesCheck())
      .pipe(
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => this.checkingForUpdates.set(false))
      )
      // HTTP errors are presented by the interceptor; allow a later retry.
      // The check did not start, so a later check that finishes is not its result.
      .subscribe({ error: () => this.#checkStartedAfter.set(undefined) });
  }
}
