import { computed, inject, Injectable } from '@angular/core';

import { DestinationConfigState } from '../../core/states/destinationconfig.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import { BackupState } from '../backup.state';
import { SingleDestinationStateDefault } from './single-destination/single-destination-default.state';

@Injectable({
  providedIn: 'root',
})
export class SingleDestinationStateOverride implements SingleDestinationStateDefault {
  #sysinfo = inject(SysinfoState);
  #backupState = inject(BackupState);
  #serverSettings = inject(ServerSettingsService);
  #destinationState = inject(DestinationConfigState);

  backendModules = computed(() => this.#destinationState.backendModules());
  serverSettingsOverride = computed(() => this.#serverSettings.serverSettings()?.['--oauth-url']);
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

  TEXTS = {
    advancedOptions: $localize`Advanced options`,
    showEditor: $localize`Show editor`,
    addAdvancedOption: $localize`Add advanced option`,
    editContentsAsText: $localize`Edit contents as text`,
    mandatoryField: $localize`This field is mandatory`,
    emptyPath: $localize`An empty path means storing data in the initial or root folder, which is not recommended`,
    hostnameInvalid: $localize`Hostname is invalid`,
    bucketnameInvalid: $localize`Bucket name is invalid`,
    customAdvancedOptionPlaceholder: $localize`Paste advanced options here, one per line.`,
  };
}
