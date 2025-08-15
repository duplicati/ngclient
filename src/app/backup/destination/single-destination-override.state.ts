import { computed, inject, Injectable } from '@angular/core';

import { DestinationConfigState } from '../../core/states/destinationconfig.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import { BackupState } from '../backup.state';

@Injectable({
  providedIn: 'root',
})
export class SingleDestinationStateOverride {
  #sysinfo = inject(SysinfoState);
  #backupState = inject(BackupState);
  #serverSettings = inject(ServerSettingsService);
  #destinationState = inject(DestinationConfigState);

  backendModules = computed(() => this.#destinationState.backendModules());
  serverOverride = computed(() => this.#serverSettings.serverSettings()?.['--oauth-url']);
  backupServerOverride = computed(() => {
    const backupServerOverride = this.#backupState.mapFormsToSettings().find((x) => x.Name === '--oauth-url')?.Value;

    if (backupServerOverride && backupServerOverride.length > 0) return backupServerOverride;

    return undefined;
  });

  oauthUrls = computed(() => {
    const v1 = this.#sysinfo.defaultOAuthUrl();
    const v2 = this.#sysinfo.defaultOAuthUrlV2();

    return {
      v1,
      v2,
    };
  });
}
