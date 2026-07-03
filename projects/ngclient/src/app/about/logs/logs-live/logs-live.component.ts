import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipList } from '@ship-ui/core/ship-list';
import { ShipTable } from '@ship-ui/core/ship-table';
import { LogsLiveState } from './logs-live.state';

@Component({
  selector: 'app-logs-live',
  imports: [ShipTable, ShipIcon, ShipList, DatePipe, ShipButton],
  templateUrl: './logs-live.component.html',
  styleUrl: './logs-live.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-disabled]': "logLevel() === 'Disabled'",
  },
})
export default class LogsLiveComponent {
  #logsLiveState = inject(LogsLiveState);

  whenFilter = input<number | null>();
  backupIdFilter = input<string | null>();
  polling = input<boolean>();

  logLevel = this.#logsLiveState.logLevel;
  logLevelByLabel = this.#logsLiveState.logLevelByLabel;
  logs = this.#logsLiveState.logs;
  logsLoading = this.#logsLiveState.logsLoading;

  pollingEffect = effect(() => {
    const polling = this.polling() ?? false;

    this.#logsLiveState.isPolling.set(polling);
  });

  openRowId = signal<number | null>(null);

  whenEffect = effect(() => {
    const whenFilter = this.whenFilter() ?? null;

    this.#logsLiveState.setWhenFilter(whenFilter);
    this.#logsLiveState.logLevel.set(whenFilter ? 'Verbose' : 'Disabled');
  });

  backupIdEffect = effect(() => {
    const backupIdFilter = this.backupIdFilter() ?? null;

    this.#logsLiveState.setBackupIdFilter(backupIdFilter);
    this.#logsLiveState.logLevel.set(backupIdFilter ? 'Verbose' : 'Disabled');
  });

  toggleRow(id: number | null | undefined) {
    if (id == null) return;
    this.openRowId.set(id === this.openRowId() ? null : id);
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
