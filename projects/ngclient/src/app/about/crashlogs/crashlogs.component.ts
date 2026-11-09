import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { CrashLogState } from '../../core/states/crashlog.state';

@Component({
  selector: 'app-crashlogs',
  imports: [ShipButton],
  templateUrl: './crashlogs.component.html',
  styleUrl: './crashlogs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CrashlogsComponent {
  #crashLogState = inject(CrashLogState);

  logsLoading = this.#crashLogState.isLoading;
  loadFailed = this.#crashLogState.loadFailed;
  crashLog = this.#crashLogState.crashLog;

  ngOnInit() {
    this.#crashLogState.load();
  }

  retry() {
    this.#crashLogState.load();
  }

  breakIntoLines(str: string | null): string[] {
    if (!str) return [];

    return str.split('\n');
  }
}
