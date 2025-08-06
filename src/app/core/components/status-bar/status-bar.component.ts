import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
    ShipButtonComponent,
    ShipDialogService,
    ShipIconComponent,
    ShipProgressBarComponent,
    ShipSpinnerComponent,
} from '@ship-ui/core';
import { DuplicatiServerService } from '../../openapi';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { ServerStateService } from '../../services/server-state.service';
import { BackupsState } from '../../states/backups.state';
import { RelayconfigState } from '../../states/relayconfig.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { PauseDialogComponent } from './pause-dialog/pause-dialog.component';
import { StatusBarState } from './status-bar.state';
import ThrottleSettingsDialogComponent from './throttle-settings-dialog/throttle-settings-dialog.component';

const date = new Date();
@Component({
  selector: 'app-status-bar',
  imports: [
    ShipProgressBarComponent,
    RelativeTimePipe,
    DatePipe,
    ShipIconComponent,
    ShipButtonComponent,
    ShipSpinnerComponent,
  ],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusBarComponent {
  #dupServer = inject(DuplicatiServerService);
  #statusBarState = inject(StatusBarState);
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #relayconfigState = inject(RelayconfigState);
  #sysinfo = inject(SysinfoState);
  #serverState  = inject(ServerStateService);

  minsAgo = date.setMinutes(date.getMinutes() - 1);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;
  clientIsRunning = this.#statusBarState.clientIsRunning;
  isResuming = this.#statusBarState.isResuming;
  runningTask = computed(() => this.#serverState.serverState()?.ActiveTask?.Item1);
  isStopping = computed(() => this.runningTask() == this.#taskStopRequested());
  #taskStopRequested = signal(-1);
  pgState = computed(() => this.#serverState.serverState());

  nextBackup = computed(() => {
    // Trigger if the backup list changes
    const _ = this.#backupsState.backups();
    return {
      backup: (this.serverState()?.ProposedSchedule?.[0] as any)?.backup,
      time: (this.serverState()?.ProposedSchedule?.[0] as any)?.Item2,
    };
  });

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
