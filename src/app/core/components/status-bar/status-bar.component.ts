import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  SparkleButtonComponent,
  SparkleDialogService,
  SparkleIconComponent,
  SparkleProgressBarComponent,
  SparkleSpinnerComponent,
} from '@sparkle-ui/core';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { BackupsState } from '../../states/backups.state';
import { RelayconfigState } from '../../states/relayconfig.state';
import { PauseDialogComponent } from './pause-dialog/pause-dialog.component';
import { StatusBarState } from './status-bar.state';
import ThrottleSettingsDialogComponent from './throttle-settings-dialog/throttle-settings-dialog.component';

const date = new Date();
@Component({
  selector: 'app-status-bar',
  imports: [
    SparkleProgressBarComponent,
    RelativeTimePipe,
    DatePipe,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleSpinnerComponent,
  ],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusBarComponent {
  #statusBarState = inject(StatusBarState);
  #dialog = inject(SparkleDialogService);
  #backupsState = inject(BackupsState);
  #relayconfigState = inject(RelayconfigState);

  minsAgo = date.setMinutes(date.getMinutes() - 1);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;
  clientIsRunning = this.#statusBarState.clientIsRunning;
  isResuming = this.#statusBarState.isResuming;

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

  ngAfterViewInit() {
    const defaultConnectionMethod = this.#relayconfigState.relayIsEnabled() ? 'longpoll' : 'websocket';
    this.#statusBarState.setConnectionMethod(defaultConnectionMethod);
  }
}
