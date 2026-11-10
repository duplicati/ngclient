import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { defer, finalize, Subscription } from 'rxjs';
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
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #router = inject(Router);
  #dupServer = inject(DuplicatiServer);

  id = input.required<string>();
  backup = computed(() => this.#backupsState.getBackupById(this.id()));

  brokenFilesResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) =>
      defer(() => this.#dupServer.postApiV2BackupListBrokenFiles({ body: { BackupId: params.id } })),
  });

  isLoading = computed(() => this.brokenFilesResource.isLoading());
  isPurging = signal(false);
  purgeError = signal(false);
  #confirmation: object | null = null;
  #purgeSubscription?: Subscription;
  #destroyed = false;
  filesets = signal<ListBrokenFilesFilesetItem[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#resetPurge();
    });
    effect(() => {
      this.id();
      untracked(() => this.#resetPurge());
    });
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

  #resetPurge() {
    this.#confirmation = null;
    this.#purgeSubscription?.unsubscribe();
    this.#purgeSubscription = undefined;
    this.isPurging.set(false);
    this.purgeError.set(false);
  }

  purgeBrokenFiles() {
    if (
      this.#destroyed ||
      this.#confirmation ||
      this.isPurging() ||
      this.isLoading() ||
      !this.brokenFilesResource.hasValue()
    )
      return;
    const id = this.id();
    const reviewedFilesets = this.filesets();
    const count = this.totalFiles();
    if (count === 0) return;

    const confirmation = {};
    this.#confirmation = confirmation;
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm purge`,
        message: $localize`Are you sure you want to fully remove ${count} broken file(s)?`,
        confirmText: $localize`Purge broken files`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (this.#destroyed || this.#confirmation !== confirmation || this.id() !== id) return;
        this.#confirmation = null;
        if (!res || this.isLoading() || !this.brokenFilesResource.hasValue() || this.filesets() !== reviewedFilesets)
          return;
        this.purgeError.set(false);
        this.isPurging.set(true);
        this.#purgeSubscription = defer(() =>
          this.#dupServer.postApiV2BackupPurgeBrokenFiles({
            body: {
              BackupId: id,
            },
          })
        )
          .pipe(finalize(() => this.isPurging.set(false)))
          .subscribe({
            next: () => {
              if (!this.#destroyed && this.id() === id) this.#router.navigate(['/']);
            },
            error: () => {
              if (!this.#destroyed && this.id() === id) this.purgeError.set(true);
            },
          });
      },
    });
  }
}
