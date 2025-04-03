import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CrashLogState } from '../../core/states/crashlog.state';

@Component({
  selector: 'app-crashlogs',
  imports: [],
  templateUrl: './crashlogs.component.html',
  styleUrl: './crashlogs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CrashlogsComponent {
  #crashLogState = inject(CrashLogState);

  logsLoading = computed(() => !this.#crashLogState.isLoaded());
  crashLog = this.#crashLogState.crashLog;

  ngOnInit() {
    this.#crashLogState.load();
  }

  breakIntoLines(str: string | null): string[] {
    if (!str) return [];

    return str.split('\n');
  }
}
