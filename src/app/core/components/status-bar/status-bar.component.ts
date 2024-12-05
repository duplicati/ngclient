import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SparkleProgressBarComponent } from '@sparkle-ui/core';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { StatusBarState } from './status-bar.state';

const date = new Date();
@Component({
  selector: 'app-status-bar',
  imports: [
    SparkleProgressBarComponent,
    RelativeTimePipe,
    // DatePipe,
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

  minsAgo = date.setMinutes(date.getMinutes() - 1);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;

  nextBackup = computed(() => ({
    backup: (this.serverState()?.ProposedSchedule?.[0] as any)?.backup,
    time: (this.serverState()?.ProposedSchedule?.[0] as any)?.Item2,
  }));

  ngOnInit() {
    this.#statusBarState.start();
  }

  ngOnDestroy() {
    this.#statusBarState.stop();
  }
}
