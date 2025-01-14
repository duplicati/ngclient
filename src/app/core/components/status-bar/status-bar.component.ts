import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  SparkleButtonComponent,
  SparkleDialogService,
  SparkleIconComponent,
  SparkleProgressBarComponent,
} from '@sparkle-ui/core';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
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
  #statusBarState = inject(StatusBarState);
  #dialog = inject(SparkleDialogService);

  minsAgo = date.setMinutes(date.getMinutes() - 1);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;

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

  ngOnInit() {
    this.#statusBarState.start();
  }

  ngOnDestroy() {
    this.#statusBarState.stop();
  }
}
