import { computed, inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { LazySignal } from '../functions/lazy-signal';
import { DuplicatiServer, WebModuleOutputDto } from '../openapi';

export type WebModuleOption = { key: string; value: any };

/** The user item-count breakdown. `licensed` and `sharedMailboxWithStorage` require a license seat; the remainder do not. */
export type Office365UserCounts = {
  total: number;
  licensed: number;
  unlicensed: number;
  sharedMailboxWithStorage: number;
  sharedMailboxWithoutStorage: number;
};

/** The group item-count breakdown. Only `unified` groups require a seat. */
export type Office365GroupCounts = {
  total: number;
  unified: number;
  notUnified: number;
};

/** The site item-count breakdown. */
export type Office365SiteCounts = {
  total: number;
  group: number;
  classic: number;
  communication: number;
  personal: number;
  other: number;
};

/** The item-count breakdown returned by the office365 `CountItems` operation. */
export type Office365Counts = {
  users: Office365UserCounts;
  groups: Office365GroupCounts;
  sites: Office365SiteCounts;
};

@Injectable({
  providedIn: 'root',
})
export class WebModulesService {
  #dupServer = inject(DuplicatiServer);

  #s3Providers = new LazySignal(() => this.getS3Config('Providers'));
  #s3Regions = new LazySignal(() => this.getS3Config('Regions'));
  #s3RegionHosts = new LazySignal(() => this.getS3Config('RegionHosts'));
  #s3StorageClasses = new LazySignal(() => this.getS3Config('StorageClasses'));
  #s3AllProviders = computed(() => {
    const providers = this.#s3Providers.value()();
    const regionHosts = this.#s3RegionHosts.value()();

    const merged = [
      ...(providers ?? []),
      ...(regionHosts?.map((x) => ({ key: `Amazon ${x.key}`, value: x.value })) ?? []),
    ];

    return Array.from(new Map(merged.map((item) => [item.value, item])).values());
  });

  #storjSatellites = new LazySignal(() => this.getStorjConfig('Satellites'));
  #storjAuthenticationMethods = new LazySignal(() => this.getStorjConfig('AuthenticationMethods'));

  #openstackProviders = new LazySignal(() => this.getOpenstackConfig('Providers'));
  #openstackVersions = new LazySignal(() => this.getOpenstackConfig('Versions'));

  #gcsLocations = new LazySignal(() => this.getGcsConfig('Locations'));
  #gcsStorageClasses = new LazySignal(() => this.getGcsConfig('StorageClasses'));

  getS3AllProviders() {
    this.#s3Providers.load();
    this.#s3RegionHosts.load();
    return this.#s3AllProviders;
  }

  getS3ProvidersFiltered(predicate: (option: WebModuleOption) => boolean) {
    return computed(() => this.getS3AllProviders()().filter(predicate));
  }

  getS3Providers() {
    return this.#s3Providers.load();
  }
  getS3Regions() {
    return this.#s3Regions.load();
  }
  getS3RegionHosts() {
    return this.#s3RegionHosts.load();
  }
  getS3StorageClasses() {
    return this.#s3StorageClasses.load();
  }
  getStorjSatellites() {
    return this.#storjSatellites.load();
  }
  getStorjAuthenticationMethods() {
    return this.#storjAuthenticationMethods.load();
  }
  getOpenstackProviders() {
    return this.#openstackProviders.load();
  }
  getOpenstackVersions() {
    return this.#openstackVersions.load();
  }
  getGcsLocations() {
    return this.#gcsLocations.load();
  }
  getGcsStorageClasses() {
    return this.#gcsStorageClasses.load();
  }

  private getS3Config(config: 'Providers' | 'Regions' | 'RegionHosts' | 'StorageClasses') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 's3-getconfig',
        requestBody: {
          's3-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  createS3IamUser(username: string, password: string) {
    return this.#dupServer.postApiV1WebmoduleByModulekey({
      modulekey: 's3-iamconfig',
      requestBody: {
        's3-operation': 'CanCreateUser',
        's3-username': username,
        's3-password': password,
      },
    });
  }

  createS3PolicyIAM(path: string) {
    return this.#dupServer.postApiV1WebmoduleByModulekey({
      modulekey: 's3-iamconfig',
      requestBody: {
        's3-operation': 'GetPolicyDoc',
        path, // "${bucketname}/{path on server}"
      },
    });
  }

  private getStorjConfig(config: 'Satellites' | 'AuthenticationMethods') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'storj-getconfig',
        requestBody: {
          'storj-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  private getOpenstackConfig(config: 'Providers' | 'Versions') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'openstack-getconfig',
        requestBody: {
          'openstack-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  private getGcsConfig(config: 'Locations' | 'StorageClasses') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'gcs-getconfig',
        requestBody: {
          'gcs-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  #defaultMapResultObjToArray(x: WebModuleOutputDto) {
    return ((x.Result &&
      typeof x.Result === 'object' &&
      Object.entries(x.Result).map(([key, value]) => ({
        key,
        value,
      }))) ??
      []) as WebModuleOption[];
  }

  getDuplicatiStorageBackups(url: string) {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'duplicati-list-backups',
        requestBody: {
          action: 'ListBackups',
          url,
        },
      })
      .pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'folders')?.value as string),
        map((folders) => JSON.parse(folders) as string[])
      );
  }

  getFilenApiKey(url: string, backupId?: string | null) {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'filen-get-api-key',
        requestBody: {
          'filen-operation': 'GetApiKey',
          'backup-id': backupId ?? '',
          url,
        },
      })
      .pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'api-key')?.value as string)
      );
  }

  /**
   * Counts the number of top-level Microsoft 365 items (users, groups, sites)
   * for the given destination URL, broken down by license seat usage and sub-type.
   */
  getOffice365Counts(url: string, sourcePrefix: string, backupId: string | null) {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'office365',
        requestBody: {
          'backup-id': backupId ?? '',
          'source-prefix': sourcePrefix,
          operation: 'CountItems',
          url,
        },
      })
      .pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'counts')?.value as string),
        map((counts) => JSON.parse(counts) as Office365Counts)
      );
  }
}
