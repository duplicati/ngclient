import { computed, inject, Injectable, Signal } from '@angular/core';
import {
  getAllConfigurationsByKey,
  getConfigurationByKey,
} from '../../backup/destination/destination.config-utilities';
import { SysinfoState } from './sysinfo.state';

export type DestinationTypeOption = {
  key: string;
  customKey: string | null;
  displayName: string;
  description: string;
  icon: string;
  searchTerms: string;
  sortOrder?: number;
};

@Injectable({
  providedIn: 'root',
})
export class DestinationConfigState {
  #sysinfo = inject(SysinfoState);

  supportedDestinationTypes = computed(() => {
    return this.#sysinfo
      .backendModules()
      .flatMap((m) => {
        if (!m?.Key) {
          return null;
        }
        const entries = getAllConfigurationsByKey(m.Key);
        if (entries.length <= 1) {
          const entry = getConfigurationByKey(m.Key);
          const defaultEntry = (<any>entry).isDefaultEntry === true;
          if (!defaultEntry) return entry;

          return [
            {
              ...entry,
              displayName: m.DisplayName || entry.displayName || m.Key,
              description: m.Description || entry.description || '',
            },
          ];
        } else {
          return entries;
        }
      })
      .filter((x) => x !== null);
  });

  destinationTypeOptions = computed(() =>
    this.supportedDestinationTypes().map((x) => ({
      key: x.customKey ?? x.key,
      customKey: x.customKey ?? null,
      displayName: x.displayName,
      description: x.description,
      icon: x.icon,
      searchTerms: [x.displayName, x.description, x.key, x.searchTerms ?? '', x.customKey ?? ''].join(' '),
      sortOrder: x.sortOrder ?? 0,
    }))
  ) as Signal<DestinationTypeOption[]>;

  backendModules = computed(() => this.#sysinfo.backendModules() ?? []);
}
