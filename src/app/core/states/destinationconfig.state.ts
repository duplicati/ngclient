import { computed, inject, Injectable } from '@angular/core';
import { getConfigurationByKey } from '../../backup/destination/destination.config-utilities';
import { SysinfoState } from './sysinfo.state';

@Injectable({
  providedIn: 'root',
})
export class DestinationConfigState {
  #sysinfo = inject(SysinfoState);

  supportedDestinationTypes = computed(() =>
    this.#sysinfo
      .backendModules()
      .map((x) => x.Key!)
      .filter((x) => x)
      .map((key) => getConfigurationByKey(key))
  );

  destinationTypeOptions = computed(() =>
    this.supportedDestinationTypes().map((x) => ({
      key: x.customKey ?? x.key,
      customKey: x.customKey ?? null,
      displayName: x.displayName,
      description: x.description,
    }))
  );

  backendModules = computed(() => this.#sysinfo.backendModules() ?? []);
}
