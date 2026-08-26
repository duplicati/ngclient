import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import {
  CustomRemoteModule,
  CustomRemotePermissionStatus,
  WebModulesService,
} from '../../../core/services/webmodules.service';

type Status = 'loading' | 'success' | 'error';

export type CustomRemotePermissionsMode = 'backup' | 'restore';

export type CustomRemotePermissionsDialogData = {
  url: string;
  sourcePrefix: string;
  backupId: string | null;
  module: CustomRemoteModule;
  mode: CustomRemotePermissionsMode;
};

@Component({
  selector: 'app-custom-remote-permissions-dialog',
  imports: [NgTemplateOutlet, ShipButton, ShipIcon],
  templateUrl: './custom-remote-permissions-dialog.html',
  styleUrl: './custom-remote-permissions-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomRemotePermissionsDialog {
  #webModules = inject(WebModulesService);

  data = input<CustomRemotePermissionsDialogData | null>();
  closed = output<void>();

  status = signal<Status>('loading');
  error = signal<string | null>(null);
  permissions = signal<CustomRemotePermissionStatus[] | null>(null);

  /** Only the permissions relevant to the current operation (backup or restore) are shown. */
  visiblePermissions = computed(() => {
    const permissions = this.permissions();
    if (!permissions) return null;

    const mode = this.data()?.mode ?? 'backup';
    return permissions.filter((p) => (mode === 'backup' ? p.requiredForBackup : p.requiredForRestore));
  });

  /** Permissions that are not required for either operation, listed under a separate header. */
  additionalPermissions = computed(() => {
    const permissions = this.permissions();
    if (!permissions) return null;

    return permissions.filter((p) => !p.requiredForBackup && !p.requiredForRestore);
  });

  #loadEffect = effect(() => {
    const data = this.data();
    const url = data?.url;
    const sourcePrefix = data?.sourcePrefix;
    const backupId = data?.backupId ?? null;
    const module = data?.module;
    if (!url || !sourcePrefix || !module) {
      this.status.set('error');
      this.error.set($localize`No URL provided`);
      return;
    }

    this.status.set('loading');

    const request =
      module === 'googleworkspace'
        ? this.#webModules.getGsuitePermissions(url, sourcePrefix, backupId)
        : this.#webModules.getOffice365Permissions(url, sourcePrefix, backupId);

    request.subscribe({
      next: (result) => {
        this.permissions.set(result);
        this.status.set('success');
      },
      error: (err) => {
        this.error.set(err?.message ?? $localize`Failed to load permissions`);
        this.status.set('error');
      },
    });
  });
}
