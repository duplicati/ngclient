import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { defer, finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';

import { ShipTable } from '@ship-ui/core/ship-table';
import { DuplicatiServer, ListFilesetsResponseItem } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { BackupsState } from '../../core/states/backups.state';

type VersionOption = ListFilesetsResponseItem & {
  Selected: boolean;
};

type OrderBy = 'version' | 'size' | 'files';

@Component({
  selector: 'app-delete-versions',
  imports: [ShipButton, ShipCheckbox, ShipProgressBar, ShipTable, BytesPipe, RelativeTimePipe, RouterLink],
  templateUrl: './delete-versions.component.html',
  styleUrl: './delete-versions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DeleteVersionsComponent {
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #router = inject(Router);
  #destroyRef = inject(DestroyRef);

  id = input.required<string>();
  backup = computed(() => {
    const backups = this.#backupsState.backups();
    return this.#backupsState.getBackupById(this.id());
  });

  versionsResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) => defer(() => this.#dupServer.postApiV2BackupListFilesets({ body: { BackupId: params.id } })),
  });

  isLoading = computed(() => this.versionsResource.isLoading());
  isDeleting = signal(false);
  performCompact = signal(true);
  versions = signal<VersionOption[]>([]);

  constructor() {
    effect(() => {
      const res = this.versionsResource.value();
      if (res) {
        const data = (res.Data ?? []).slice().sort((a, b) => (a.Time < b.Time ? 1 : a.Time > b.Time ? -1 : 0));
        this.versions.set(data.map((v) => ({ ...v, Selected: false })));
      }
    });
  }

  selectedItems = computed(() => this.versions().filter((v) => v.Selected));
  allSelected = computed(() => this.selectedItems().length === this.versions().length && this.versions().length > 0);
  noneSelected = computed(() => this.selectedItems().length === 0);
  indeterminate = computed(() => this.selectedItems().length > 0 && !this.allSelected());

  sortByColumn = signal<OrderBy | null>('version');

  toggleSelected(version: number, event: Event | null) {
    event?.stopPropagation();
    this.versions.update((versions) =>
      versions.map((v) => (v.Version === version ? { ...v, Selected: !v.Selected } : v))
    );
  }

  toggleSelect() {
    if (this.allSelected()) {
      this.selectNone();
    } else {
      this.selectAll();
    }
  }

  selectAll() {
    this.versions.update((versions) => versions.map((v) => ({ ...v, Selected: true })));
  }

  selectNone() {
    this.versions.update((versions) => versions.map((v) => ({ ...v, Selected: false })));
  }

  deleteVersions() {
    if (this.isDeleting()) return;
    const selected = this.selectedItems();
    if (selected.length === 0) return;

    const count = selected.length;
    const versions = selected.map((v) => v.Version);
    const id = this.id();
    const suppressCompact = !this.performCompact();
    this.isDeleting.set(true);

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm delete`,
        message: $localize`Are you sure you want to delete ${count} version(s)?`,
        confirmText: $localize`Delete versions`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res || this.#destroyRef.destroyed || this.id() !== id) {
          this.isDeleting.set(false);
          return;
        }
        defer(() =>
          this.#dupServer.postApiV2BackupDeleteVersions({
            body: {
              BackupId: id,
              Versions: versions,
              SuppressCompact: suppressCompact,
            },
          })
        )
          .pipe(
            takeUntilDestroyed(this.#destroyRef),
            finalize(() => this.isDeleting.set(false))
          )
          .subscribe({
            next: () => {
              if (this.id() === id) this.#router.navigate(['/']);
            },
            // The shared HTTP interceptor reports the failure; allow another attempt.
            error: () => {},
          });
      },
    });
  }
}
