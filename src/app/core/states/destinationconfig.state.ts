import { computed, inject, Injectable } from '@angular/core';
import { DESTINATION_CONFIG } from '../../backup/destination/destination.config';
import { SysinfoState } from './sysinfo.state';

@Injectable({
  providedIn: 'root',
})
export class DestinationConfigState {
  #sysinfo = inject(SysinfoState);

  supportedDestinationTypes = computed(() => {
    const supportedKeys = this.#sysinfo
      .backendModules()
      .map((x) => x.Key!)
      .filter((x) => x);

    return DESTINATION_CONFIG
      .filter(x => supportedKeys.includes(x.key));
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
