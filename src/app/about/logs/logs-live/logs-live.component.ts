import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SparkleIconComponent, SparkleListComponent, SparkleTableComponent } from '@sparkle-ui/core';
import { LogsLiveState } from './logs-live.state';

@Component({
  selector: 'app-logs-live',
  imports: [SparkleTableComponent, SparkleIconComponent, SparkleListComponent, DatePipe],
  templateUrl: './logs-live.component.html',
  styleUrl: './logs-live.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogsLiveComponent {
  #logsLiveState = inject(LogsLiveState);

  logLevel = this.#logsLiveState.logLevel;
  logLevelByLabel = this.#logsLiveState.logLevelByLabel;
  logs = this.#logsLiveState.logs;
  logsLoading = this.#logsLiveState.logsLoading;

  openRowIndex = signal<number | null>(null);

  toggleRow(index: number) {
    this.openRowIndex.set(index === this.openRowIndex() ? null : index);
  }

  breakIntoLines(str: string | null | undefined): string[] {
    if (!str) return [];

    return str.split('\n');
  }

  subStringMessage(str: string | null | undefined): string {
    if (!str) return '';
    return str.substring(0, 80) + '...';
  }

  ngOnDestroy() {
    this.#logsLiveState.destroy();
  }
}
