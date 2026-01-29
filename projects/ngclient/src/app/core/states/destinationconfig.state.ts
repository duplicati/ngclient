import { computed, inject, Injectable } from '@angular/core';
import {
  getAllConfigurationsByKey,
  getConfigurationByKey,
} from '../../backup/destination/destination.config-utilities';
import { IDynamicModule } from '../openapi';
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

  #mapModulesToConfigEntries(modules: IDynamicModule[]) {
    return modules
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
  }

  #mapConfigEntriesToOptions(entries: any[]): DestinationTypeOption[] {
    return entries.map((x) => ({
      key: x.customKey ?? x.key,
      customKey: x.customKey ?? null,
      displayName: x.displayName,
      description: x.description,
      icon: x.icon,
      searchTerms: [x.displayName, x.description, x.key, x.searchTerms ?? '', x.customKey ?? ''].join(' '),
      sortOrder: x.sortOrder ?? 0,
    }));
  }

  backendDestinationOptions = computed(() => {
    const modules = this.#sysinfo.backendModules();
    const entries = this.#mapModulesToConfigEntries(modules);
    return this.#mapConfigEntriesToOptions(entries);
  });

  sourceProviderOptions = computed(() => {
    const modules = this.#sysinfo.sourceProviderModules();
    const entries = this.#mapModulesToConfigEntries(modules.length ? modules : this.#sysinfo.backendModules());
    return this.#mapConfigEntriesToOptions(entries);
  });

  restoreDestinationOptions = computed(() => {
    const modules = this.#sysinfo.restoreDestinationProviderModules();
    const entries = this.#mapModulesToConfigEntries(modules.length ? modules : this.#sysinfo.backendModules());
    return this.#mapConfigEntriesToOptions(entries);
  });

  destinationTypeOptions = this.backendDestinationOptions;

  allModules = computed(() =>
    [
      ...this.#sysinfo.backendModules(),
      ...this.#sysinfo.sourceProviderModules(),
      ...this.#sysinfo.restoreDestinationProviderModules(),
    ].reduce((acc, curr) => {
      if (!acc.find((x) => x.Key === curr.Key)) {
        acc.push(curr);
      }
      return acc;
    }, [] as IDynamicModule[])
  );
}
