import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SparkleButtonComponent, SparkleIconComponent, SparkleProgressBarComponent } from '@sparkle-ui/core';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { StatusBarState } from './status-bar.state';

@Component({
    selector: 'app-status-bar',
    imports: [SparkleButtonComponent, SparkleIconComponent, SparkleProgressBarComponent, RelativeTimePipe, JsonPipe],
    templateUrl: './status-bar.component.html',
    styleUrl: './status-bar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export default class StatusBarComponent {
  #statusBarState = inject(StatusBarState);

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
