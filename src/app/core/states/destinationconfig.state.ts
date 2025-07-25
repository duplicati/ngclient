import { computed, inject, Injectable } from '@angular/core';
import { getConfigurationByKey } from '../../backup/destination/destination.config-utilities';
import { SysinfoState } from './sysinfo.state';

@Injectable({
  providedIn: 'root',
})
export class DestinationConfigState {
  #sysinfo = inject(SysinfoState);

  supportedDestinationTypes = computed(() => {
    return this.#sysinfo
      .backendModules()
      .map((m) => {
        if (!m?.Key) {
          return null;
        }
        const entry = getConfigurationByKey(m.Key);
        const defaultEntry = (<any>entry).isDefaultEntry === true;
        if (!defaultEntry)
            return entry;

        return {
          ...entry,
          displayName: m.DisplayName || entry.displayName || m.Key,
          description: m.Description || entry.description || '',
        };
      })
      .filter((x) => x !== null);
  });

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
