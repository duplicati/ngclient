import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ShipButton, ShipIcon, ShipProgressBar, ShipSpinner, ShipTooltip } from '@ship-ui/core';
import { BytesPipe } from '../../pipes/byte.pipe';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { BackupsState } from '../../states/backups.state';
import { StatusBarState } from '../status-bar/status-bar.state';

@Component({
  selector: 'app-backup-progress',
  imports: [RelativeTimePipe, DatePipe, ShipIcon, ShipButton, ShipSpinner, ShipProgressBar, ShipTooltip],
  templateUrl: './backup-progress.component.html',
  styleUrl: './backup-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BytesPipe],
  host: {
    '[class.is-visible]': 'isVisible()',
  },
})
export class BackupProgressComponent {
  backupId = input<string | number | null>(null);

  #statusBarState = inject(StatusBarState);
  #backupsState = inject(BackupsState);

  statusData = this.#statusBarState.statusData;
  serverState = this.#statusBarState.serverState;

  isActive = computed(() => {
    return this.#statusBarState.runningBackupId() !== null;
  });

  isTargetRunningTask = computed(() => {
    const id = this.backupId();
    if (id) {
      return String(this.#statusBarState.runningBackupId()) === String(id);
    }
    return true; // If no id is specified, it targets the global active task
  });

  isVisible = computed(() => {
    const targetId = this.backupId();
    if (!targetId) return true; // Global mode always shows something (progress, next backup, or "No tasks")

    // Specific mode only shows if it's the currently active running task
    if (this.isActive()) {
      return this.isTargetRunningTask();
    }

    return false;
  });

  nextBackup = computed(() => {
    const _ = this.#backupsState.backups();
    return {
      backup: (this.serverState()?.ProposedSchedule?.[0] as any)?.backup,
      time: (this.serverState()?.ProposedSchedule?.[0] as any)?.Item2,
    };
  });

  tooltipText = computed(() => {
    const data = this.statusData();
    if (!data?.CurrentFilename) return '';
    return `${data.CurrentFilename}`;
  });

  copied = signal(false);
  copiedTimeout?: any;

  copyToClipboard($event: Event, text: string) {
    $event.stopPropagation();
    navigator.clipboard.writeText(text);
    this.copied.set(true);

    this.copiedTimeout = setTimeout(() => {
      this.copied.set(false);
    }, 2000);
  }

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
}
