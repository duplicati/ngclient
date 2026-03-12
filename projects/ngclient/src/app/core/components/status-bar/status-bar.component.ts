import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ShipButton, ShipDialogService, ShipIcon, ShipMenu } from '@ship-ui/core';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { DuplicatiServer } from '../../openapi';
import { ServerStateService } from '../../services/server-state.service';
import { RelayconfigState } from '../../states/relayconfig.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { BackupProgressComponent } from '../backup-progress/backup-progress.component';
import { MobileMenuToggleComponent } from '../mobile-menu-toggle/mobile-menu-toggle.component';
import { PauseDialogComponent } from './pause-dialog/pause-dialog.component';
import RemoteConnectivityStatus from './remote-connectivity-status/remote-connectivity-status';
import { StatusBarState } from './status-bar.state';
import ThrottleSettingsDialogComponent from './throttle-settings-dialog/throttle-settings-dialog.component';

@Component({
  selector: 'app-status-bar',
  imports: [
    RemoteConnectivityStatus,
    ShipIcon,
    ShipButton,
    ShipMenu,
    MobileMenuToggleComponent,
    BackupProgressComponent,
  ],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusBarComponent {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);
  #dialog = inject(ShipDialogService);
  #serverState = inject(ServerStateService);
  #relayconfigState = inject(RelayconfigState);
  #sysinfo = inject(SysinfoState);
  #serverSettings = inject(ServerSettingsService);

  clientIsRunning = this.#statusBarState.clientIsRunning;
  isResuming = this.#statusBarState.isResuming;
  runningTask = computed(() => this.#serverState.serverState()?.ActiveTask?.Item1);
  isStopping = computed(() => this.runningTask() == this.#taskStopRequested());
  #taskStopRequested = signal(-1);

  isUsingRelay = this.#relayconfigState.relayIsEnabled;
  hideConsoleConnectionStatus = this.#serverSettings.isConsoleConnectionStatusHidden;

  openThrottleSettingsDialog() {
    this.#dialog.open(ThrottleSettingsDialogComponent, {
      maxWidth: '550px',
      width: '100%',
    });
  }

  openPauseDialog() {
    this.#dialog.open(PauseDialogComponent, {
      maxWidth: '550px',
      width: '100%',
    });
  }

  pauseResume() {
    if (this.clientIsRunning()) {
      this.openPauseDialog();
      return;
    }

    this.#statusBarState.pauseResume().subscribe();
  }

  stop() {
    const taskId = this.runningTask();
    if (!taskId) return;
    this.#taskStopRequested.set(taskId);
    this.#dupServer.postApiV1TaskByTaskidStop({ taskid: taskId }).subscribe();
  }

  abort() {
    const taskId = this.runningTask();
    if (!taskId) return;
    this.#dupServer.postApiV1TaskByTaskidAbort({ taskid: taskId }).subscribe();
  }

  ngAfterViewInit() {
    const defaultConnectionMethod =
      this.#relayconfigState.relayIsEnabled() || !this.#sysinfo.hasWebSocket() ? 'longpoll' : 'websocket';
    this.#statusBarState.setConnectionMethod(defaultConnectionMethod);
  }
}
