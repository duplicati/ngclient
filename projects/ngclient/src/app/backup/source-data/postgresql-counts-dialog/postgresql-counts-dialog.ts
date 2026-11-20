import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { PostgresqlCounts, WebModulesService } from '../../../core/services/webmodules.service';

type Status = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-postgresql-counts-dialog',
  imports: [ShipButton, ShipIcon, BytesPipe],
  templateUrl: './postgresql-counts-dialog.html',
  styleUrl: './postgresql-counts-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Shows how many tables a PostgreSQL database has and how large it is on the server. */
export class PostgresqlCountsDialog {
  #webModules = inject(WebModulesService);

  data = input<{ url: string; sourcePrefix: string; backupId: string | null } | null>();
  closed = output<void>();

  status = signal<Status>('loading');
  error = signal<string | null>(null);
  counts = signal<PostgresqlCounts | null>(null);

  #loadEffect = effect((onCleanup) => {
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

    const subscription = this.#webModules.getPostgresqlCounts(url, sourcePrefix, backupId).subscribe({
      next: (result) => {
        this.counts.set(result);
        this.status.set('success');
      },
      error: (err) => {
        this.error.set(err?.message ?? $localize`Failed to load counts`);
        this.status.set('error');
      },
    });
    onCleanup(() => subscription.unsubscribe());
  });
}
