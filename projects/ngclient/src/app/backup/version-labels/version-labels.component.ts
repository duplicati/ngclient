import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipTable } from '@ship-ui/core/ship-table';
import { concatMap, finalize, from } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';

import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { DuplicatiServer, ListFilesetsResponseItem } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { RelativeTimePipe } from '../../core/pipes/relative-time.pipe';
import { BackupsState } from '../../core/states/backups.state';

type VersionLabelOption = ListFilesetsResponseItem & {
  EditedLabel: string;
};

type OrderBy = 'version' | 'size' | 'files' | 'label';

@Component({
  selector: 'app-version-labels',
  imports: [
    FormsModule,
    ShipButton,
    ShipProgressBar,
    ShipTable,
    BytesPipe,
    RelativeTimePipe,
    RouterLink,
    ShipFormField,
  ],
  templateUrl: './version-labels.component.html',
  styleUrl: './version-labels.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class VersionLabelsComponent {
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #backupsState = inject(BackupsState);
  #router = inject(Router);

  id = input.required<string>();
  backup = computed(() => {
    const backups = this.#backupsState.backups();
    return this.#backupsState.getBackupById(this.id());
  });

  versionsResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) => this.#dupServer.postApiV2BackupListFilesets({ requestBody: { BackupId: params.id } }),
  });

  isLoading = computed(() => this.versionsResource.isLoading());
  isSaving = signal(false);
  versions = signal<VersionLabelOption[]>([]);

  constructor() {
    effect(() => {
      const res = this.versionsResource.value();
      if (res) {
        const data = (res.Data ?? []).slice().sort((a, b) => (a.Time < b.Time ? 1 : a.Time > b.Time ? -1 : 0));
        this.versions.set(data.map((v) => ({ ...v, EditedLabel: v.Label ?? '' })));
      }
    });
  }

  changedItems = computed(() => this.versions().filter((v) => (v.Label ?? '') !== v.EditedLabel.trim()));

  sortByColumn = signal<OrderBy | null>('version');

  updateLabel(version: number, label: string) {
    this.versions.update((versions) => versions.map((v) => (v.Version === version ? { ...v, EditedLabel: label } : v)));
  }

  saveLabels() {
    const changed = this.changedItems();
    if (changed.length === 0) return;

    this.isSaving.set(true);

    // Requests are run sequentially because the server does not allow concurrent database access
    from(changed)
      .pipe(
        concatMap((v) =>
          this.#dupServer.postApiV2BackupSetVersionLabel({
            requestBody: {
              BackupId: this.id(),
              Version: v.Version,
              Label: v.EditedLabel.trim() === '' ? null : v.EditedLabel.trim(),
            },
          })
        ),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        complete: () => {
          this.#router.navigate(['/']);
        },
        error: (err) => {
          this.#dialog.open(ConfirmDialogComponent, {
            data: {
              title: $localize`Failed to set version labels`,
              message: err.message ?? $localize`Unknown error`,
              confirmText: $localize`OK`,
              cancelText: undefined,
            },
          });
        },
      });
  }
}
