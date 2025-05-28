import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, tap } from 'rxjs';
import { FormView } from '../../backup/destination/destination.config-utilities';
import { ArgumentType, DuplicatiServerService, ICommandLineArgument, SystemInfoDto } from '../openapi';

type FilterGroups = {
  FilterGroups: {
    [key: string]: string[];
  };
};
@Injectable({
  providedIn: 'root',
})
export class SysinfoState {
  #dupServer = inject(DuplicatiServerService);

  isLoaded = signal(false);
  systemInfo = signal<SystemInfoDto | null>(null);

  filterGroups = signal<FilterGroups | null>(null);
  backendModules = computed(() => {
    // KEEP - for debugging to find a field by type
    //
    // const modules = this.systemInfo()?.BackendModules ?? [];
    //
    // for (let index = 0; index < modules.length; index++) {
    //   const module = modules[index];

    //   const sizeField = module.Options?.find((x) => x.Type === 'Size');

    //   console.log('module.DisplayName', module.DisplayName);
    //   console.log('sizeField', sizeField);
    // }

    return this.systemInfo()?.BackendModules ?? [];
  });

  allOptionsGrouped = computed(() => {
    const defaultOptions = {
      displayName: 'Default',
      options: this.systemInfo()?.Options?.map(this.#mapCommandLineArgumentsToFormViews) ?? [],
    };

    const generic =
      this.systemInfo()?.GenericModules?.map((x) => {
        return {
          displayName: x.DisplayName ?? x.Key,
          options: x.Options?.map(this.#mapCommandLineArgumentsToFormViews) ?? [],
        };
      }) ?? [];

    const compression =
      this.systemInfo()?.CompressionModules?.map((x) => {
        return {
          displayName: x.DisplayName ?? x.Key,
          options: x.Options?.map(this.#mapCommandLineArgumentsToFormViews) ?? [],
        };
      }) ?? [];

    return [defaultOptions, ...generic, ...compression];
  });

  allOptions = computed(() => {
    return this.allOptionsGrouped().reduce((acc, curr) => {
      return [...acc, ...curr.options];
    }, [] as FormView[]);
  });

  hasWebSocket = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v1:websocket');
  });


  hasV2ListOperations = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v2:backup:list-filesets') && apiExtensions.includes('v2:backup:list-folder');
  });

  hasV2TestOperations = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v2:destination:test');
  });

  hasProgressSubscribeOption = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v1:subscribe:progress');
  });

  hasTaskSubscribeOption = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v1:subscribe:taskqueue');
  });

  hasBackupListSubscribeOption = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v1:subscribe:backuplist');
  });

  hasWebSocketAuth = computed(() => {
    const apiExtensions = this.systemInfo()?.APIExtensions ?? [];
    return apiExtensions.includes('v1:websocket:authenticate');
  });


  preload(returnObservable = false): Observable<SystemInfoDto> | void {
    const obs = (this.#dupServer.getApiV1Systeminfo() as Observable<SystemInfoDto>).pipe(
      tap((systemInfo) => {
        this.systemInfo.set(systemInfo);
      }),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }

  preloadFilterGroups(returnObservable = false): Observable<FilterGroups> | void {
    const obs = (this.#dupServer.getApiV1SysteminfoFiltergroups() as Observable<FilterGroups>).pipe(
      tap((filterGroups) => {
        this.filterGroups.set(filterGroups);
      }),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }

  #mapCommandLineArgumentsToFormViews(x: ICommandLineArgument) {
    return {
      name: x.Name as string,
      type: x.Type as ArgumentType,
      shortDescription: x.ShortDescription ?? undefined,
      longDescription: x.LongDescription ?? undefined,
      deprecatedDescription: (x.Deprecated ?? false) ? x.DeprecationMessage ?? undefined : undefined,
      options: x.ValidValues,
      defaultValue: x.DefaultValue
    } as FormView;
  }
}
