import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { GoogleWorkspaceCounts, WebModulesService } from '../../../core/services/webmodules.service';

type Status = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-googleworkspace-counts-dialog',
  imports: [ShipButton, ShipIcon],
  templateUrl: './googleworkspace-counts-dialog.html',
  styleUrl: './googleworkspace-counts-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleWorkspaceCountsDialog {
  #webModules = inject(WebModulesService);

  data = input<{ url: string; sourcePrefix: string; backupId: string | null } | null>();
  closed = output<void>();

  status = signal<Status>('loading');
  error = signal<string | null>(null);
  counts = signal<GoogleWorkspaceCounts | null>(null);

  #loadEffect = effect(() => {
    const data = this.data();
    const url = data?.url;
    const sourcePrefix = data?.sourcePrefix;
    const backupId = data?.backupId ?? null;
    if (!url || !sourcePrefix) {
      this.status.set('error');
      this.error.set($localize`No URL provided`);
      return;
    }

    this.status.set('loading');

    this.#webModules.getGoogleWorkspaceCounts(url, sourcePrefix, backupId).subscribe({
      next: (result) => {
        this.counts.set(result);
        this.status.set('success');
      },
      error: (err) => {
        this.error.set(err?.message ?? $localize`Failed to load counts`);
        this.status.set('error');
      },
    });
  });
}
