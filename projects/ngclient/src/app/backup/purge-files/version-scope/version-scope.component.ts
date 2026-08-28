import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipRadio } from '@ship-ui/core/ship-radio';
import { finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer } from '../../../core/openapi';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { PurgeFilesState } from '../purge-files.state';

@Component({
  selector: 'app-purge-version-scope',
  imports: [DatePipe, ShipAlert, ShipButton, ShipCheckbox, ShipIcon, ShipRadio, BytesPipe],
  templateUrl: './version-scope.component.html',
  styleUrl: './version-scope.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PurgeVersionScopeComponent {
  #state = inject(PurgeFilesState);
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  versions = this.#state.versions;
  versionScope = this.#state.versionScope;
  specificVersions = this.#state.specificVersions;
  selectedVersion = this.#state.selectedVersion;
  selectedVersionItem = this.#state.selectedVersionItem;
  selectedPathsArray = this.#state.selectedPathsArray;
  isPurging = signal(false);

  isVersionSelected(version: number) {
    return this.specificVersions().includes(version);
  }

  toggleVersion(version: number, checked: boolean) {
    this.specificVersions.update((versions) =>
      checked ? [...versions, version] : versions.filter((x) => x !== version)
    );
  }

  goBack() {
    this.#router.navigate(['../select-files'], { relativeTo: this.#route });
  }

  purgeFiles() {
    const paths = this.selectedPathsArray();
    if (paths.length === 0) return;

    const scope = this.versionScope();
    const versions =
      scope === 'all' ? null : scope === 'current' ? [parseInt(this.selectedVersion()!)] : this.specificVersions();

    if (versions !== null && versions.length === 0) return;

    const count = paths.length;
    const versionText =
      scope === 'all'
        ? $localize`all versions`
        : scope === 'current'
          ? $localize`version ${this.selectedVersion()}`
          : $localize`version(s) ${versions!.join(', ')}`;

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm removal`,
        message: $localize`Are you sure you want to remove ${count} file(s) from ${versionText}? This cannot be undone.`,
        confirmText: $localize`Remove files`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        this.isPurging.set(true);
        this.#dupServer
          .postApiV2BackupPurgeFiles({
            requestBody: {
              BackupId: this.#state.backupId()!,
              Filters: paths.map((x) => (x.endsWith('/') || x.endsWith('\\') ? `${x}*` : x)),
              Versions: versions,
            },
          })
          .pipe(finalize(() => this.isPurging.set(false)))
          .subscribe({
            next: () => {
              this.#router.navigate(['/']);
            },
            error: (err) => {
              this.#dialog.open(ConfirmDialogComponent, {
                data: {
                  title: $localize`Failed to remove files`,
                  message: err.message ?? $localize`Unknown error`,
                  confirmText: $localize`OK`,
                  cancelText: undefined,
                },
              });
            },
          });
      },
    });
  }
}
