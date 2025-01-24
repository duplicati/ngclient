import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  SparkleButtonComponent,
  SparkleDialogService,
  SparkleIconComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../openapi';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
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
    // CurrencyPipe,
    // DecimalPipe,
    // PercentPipe,
    // DurationFormatPipe,
  ],
  templateUrl: './status-bar.component.html',
  styleUrl: './status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusBarComponent {
  #dupServer = inject(DuplicatiServerService);
  #statusBarState = inject(StatusBarState);
  #dialog = inject(SparkleDialogService);
  #relayconfigState = inject(RelayconfigState);

  minsAgo = date.setMinutes(date.getMinutes() - 1);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;
  isRunning = computed(() => this.serverState()?.ProgramState === 'Running');
  isResuming = signal<boolean>(false);

  nextBackup = computed(() => ({
    backup: (this.serverState()?.ProposedSchedule?.[0] as any)?.backup,
    time: (this.serverState()?.ProposedSchedule?.[0] as any)?.Item2,
  }));

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
    if (this.isRunning()) {
      this.openPauseDialog();
      return;
    }

    this.isResuming.set(true);
    this.#dupServer
      .postApiV1ServerstateResume()
      .pipe(finalize(() => this.isResuming.set(false)))
      .subscribe();
  }

  ngAfterViewInit() {
    const defaultConnectionMethod = this.#relayconfigState.relayIsEnabled() ? 'longpoll' : 'websocket';
    this.#statusBarState.setConnectionMethod(defaultConnectionMethod);
  }
}
