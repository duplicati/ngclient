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
      options: x.ValidValues,
    } as FormView;
  }
}
