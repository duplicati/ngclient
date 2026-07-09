import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';

import { DuplicatiServer, ListBrokenFilesFilesetItem } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { BackupsState } from '../../core/states/backups.state';

@Component({
  selector: 'app-broken-files',
  imports: [ShipButton, ShipCard, ShipProgressBar, BytesPipe, RelativeTimePipe, RouterLink],
  templateUrl: './broken-files.component.html',
  styleUrl: './broken-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BrokenFilesComponent {
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #router = inject(Router);

  id = input.required<string>();
  backup = computed(() => this.#backupsState.getBackupById(this.id()));

  brokenFilesResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) => this.#dupServer.postApiV2BackupListBrokenFiles({ requestBody: { BackupId: params.id } }),
  });

  isLoading = computed(() => this.brokenFilesResource.isLoading());
  isPurging = signal(false);
  filesets = signal<ListBrokenFilesFilesetItem[]>([]);

  constructor() {
    effect(() => {
      const res = this.brokenFilesResource.value();
      if (res) {
        const data = (res.Data ?? [])
          .slice()
          .sort((a, b) => (a.FilesetTime < b.FilesetTime ? 1 : a.FilesetTime > b.FilesetTime ? -1 : 0));
        this.filesets.set(data);
      }
    });
  }

  totalFiles = computed(() => this.filesets().reduce((sum, fs) => sum + (fs.Files?.length ?? 0), 0));

  hasBrokenFiles = computed(() => this.totalFiles() > 0);

  purgeBrokenFiles() {
    const count = this.totalFiles();
    if (count === 0) return;

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm purge`,
        message: $localize`Are you sure you want to fully remove ${count} broken file(s)?`,
        confirmText: $localize`Purge broken files`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        this.isPurging.set(true);
        this.#dupServer
          .postApiV2BackupPurgeBrokenFiles({
            requestBody: {
              BackupId: this.id(),
            },
          })
          .pipe(finalize(() => this.isPurging.set(false)))
          .subscribe({
            next: () => {
              this.#router.navigate(['/']);
            },
          });
      },
    });
  }
}
