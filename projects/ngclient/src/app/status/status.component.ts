import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ShipButton, ShipCard, ShipDialogService, ShipIcon, ShipList, ShipProgressBar } from '@ship-ui/core';
import LogsLiveComponent from '../about/logs/logs-live/logs-live.component';
import { PauseDialogComponent } from '../core/components/status-bar/pause-dialog/pause-dialog.component';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { STATUS_STATES } from '../core/constants/status-states.constant';
import { DuplicatiServer } from '../core/openapi';
import { BytesPipe } from '../core/pipes/byte.pipe';
import { RelativeTimePipe } from '../core/pipes/relative-time.pipe';
import { StatusPageState } from './status.state';

@Component({
  selector: 'app-status',
  standalone: true,
  imports: [
    CommonModule,
    ShipCard,
    ShipProgressBar,
    ShipButton,
    ShipIcon,
    BytesPipe,
    RelativeTimePipe,
    DatePipe,
    LogsLiveComponent,
    ShipList,
  ],
  templateUrl: './status.component.html',
  styleUrl: './status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusComponent implements OnInit, OnDestroy {
  #statusBarState = inject(StatusBarState);
  #statusPageState = inject(StatusPageState);
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);

  // Expose state for template
  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;
  recentFiles = this.#statusPageState.recentFiles;
  etaData = this.#statusPageState.etaData;
  transfersExpanded = signal(false);
  clientIsRunning = this.#statusBarState.clientIsRunning;

  statusText = computed(() => {
    const phase = this.statusData()?.Phase;
    return phase ? STATUS_STATES[phase] || phase : '';
  });

  progress = computed(() => {
    const data = this.statusData();
    if (!data) return 0;
    return (data.OverallProgress || 0) * 100;
  });

  nextBackup = computed(() => {
    return {
      backup: (this.serverState()?.ProposedSchedule?.[0] as any)?.backup,
      time: (this.serverState()?.ProposedSchedule?.[0] as any)?.Item2,
    };
  });

  ngOnInit(): void {
    this.#statusPageState.activateView();
  }

  ngOnDestroy(): void {
    this.#statusPageState.deactivateView();
  }

  toggleTransfers() {
    this.transfersExpanded.update((v) => !v);
  }

  isTaskRunning() {
    return !!this.statusData()?.TaskID;
  }

  taskStartTime() {
    // This is an approximation since we don't have the exact start time in statusData
    // But we can use it for the logs filter
    return this.etaData()?.startTime;
  }

  currentBackupId() {
    return this.statusData()?.BackupID;
  }

  pauseResume() {
    if (this.clientIsRunning()) {
      this.#dialog.open(PauseDialogComponent, {
        maxWidth: '550px',
        width: '100%',
      });
      return;
    }

    this.#statusBarState.pauseResume().subscribe();
  }

  stop() {
    const taskId = this.statusData()?.TaskID;
    if (!taskId) return;
    this.#dupServer.postApiV1TaskByTaskidStop({ taskid: taskId }).subscribe();
  }

  abort() {
    const taskId = this.statusData()?.TaskID;
    if (!taskId) return;
    this.#dupServer.postApiV1TaskByTaskidAbort({ taskid: taskId }).subscribe();
  }
}
