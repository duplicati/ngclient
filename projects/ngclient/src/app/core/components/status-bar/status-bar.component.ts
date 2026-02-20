import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import {
  ShipButton,
  ShipDialogService,
  ShipIcon,
  ShipMenu,
  ShipProgressBar,
  ShipSpinner,
  ShipTooltip,
} from '@ship-ui/core';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { DuplicatiServer } from '../../openapi';
import { BytesPipe } from '../../pipes/byte.pipe';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { ServerStateService } from '../../services/server-state.service';
import { BackupsState } from '../../states/backups.state';
import { RelayconfigState } from '../../states/relayconfig.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { MobileMenuToggleComponent } from '../mobile-menu-toggle/mobile-menu-toggle.component';
import { PauseDialogComponent } from './pause-dialog/pause-dialog.component';
import RemoteConnectivityStatus from './remote-connectivity-status/remote-connectivity-status';
import { StatusBarState } from './status-bar.state';
import ThrottleSettingsDialogComponent from './throttle-settings-dialog/throttle-settings-dialog.component';

const date = new Date();

type Timeout = ReturnType<typeof setTimeout>;

@Component({
  selector: 'app-status-bar',
  imports: [
    RemoteConnectivityStatus,
    RelativeTimePipe,
    DatePipe,
    ShipIcon,
    ShipButton,
    ShipSpinner,
    ShipProgressBar,
    ShipTooltip,
    ShipMenu,
    MobileMenuToggleComponent,
  ],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BytesPipe],
})
export default class StatusBarComponent {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #relayconfigState = inject(RelayconfigState);
  #sysinfo = inject(SysinfoState);
  #serverState = inject(ServerStateService);
  #serverSettings = inject(ServerSettingsService);
  #bytesPipe = inject(BytesPipe);

  minsAgo = date.setMinutes(date.getMinutes() - 1);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;
  clientIsRunning = this.#statusBarState.clientIsRunning;
  isResuming = this.#statusBarState.isResuming;
  runningTask = computed(() => this.#serverState.serverState()?.ActiveTask?.Item1);
  isStopping = computed(() => this.runningTask() == this.#taskStopRequested());
  #taskStopRequested = signal(-1);
  pgState = computed(() => this.#serverState.serverState());
  isUsingRelay = this.#relayconfigState.relayIsEnabled;
  hideConsoleConnectionStatus = this.#serverSettings.isConsoleConnectionStatusHidden;

  tooltipText = computed(() => {
    const data = this.statusData();

    if (!data?.CurrentFilename) return '';

    return `${data.CurrentFilename}`;
  });

  nextBackup = computed(() => {
    // Trigger if the backup list changes
    const _ = this.#backupsState.backups();
    return {
      backup: (this.serverState()?.ProposedSchedule?.[0] as any)?.backup,
      time: (this.serverState()?.ProposedSchedule?.[0] as any)?.Item2,
    };
  });

  tooltipTrigger = signal(true);
  tooltipTriggerEffect = effect(() => {
    this.tooltipText();
    this.tooltipTrigger.update((n) => !n);

    if (this.copiedTimeout) {
      clearTimeout(this.copiedTimeout);
      this.copiedTimeout = undefined;
      this.copied.set(false);
    }
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

  copied = signal(false);
  copiedTimeout?: Timeout;
  copyToClipboard($event: Event, text: string) {
    $event.stopPropagation();
    navigator.clipboard.writeText(text);

    this.copied.set(true);

    this.copiedTimeout = setTimeout(() => {
      this.copied.set(false);
    }, 2000);
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
