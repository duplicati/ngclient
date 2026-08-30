import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import { defer, map } from 'rxjs';
import { LazySignal } from '../functions/lazy-signal';
import { DuplicatiServer, WebModuleOutputDto } from '../openapi';
import { getApiBase } from '../utils/proxy-config.util';
import { RelayconfigState } from '../states/relayconfig.state';

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

export type Office365LegacySiteCounts = {
  total: number;
  group: number;
  classic: number;
  communication: number;
  personal: number;
  other: number;
};

export type Office365FutureSiteCounts = {
  total: number;
  group: number;
  classic: number;
  communication: number;
  personalLicensedUser: number;
  personalUnlicensedUser: number;
  other: number;
};

export type Office365SiteCountsResponse = Office365LegacySiteCounts | Office365FutureSiteCounts;

/** The site item-count breakdown (normalized). */
export type Office365SiteCounts = {
  total: number;
  group: number;
  classic: number;
  communication: number;
  personal: number | null;
  personalLicensedUser: number | null;
  personalUnlicensedUser: number | null;
  other: number;
};

export type Office365RawCounts = {
  users: Office365UserCounts;
  groups: Office365GroupCounts;
  sites: Office365SiteCountsResponse;
};

/** The item-count breakdown returned by the office365 `CountItems` operation. */
export type Office365Counts = Omit<Office365RawCounts, 'sites'> & {
  sites: Office365SiteCounts;
};

/** The custom-remote modules that support the `CheckPermissions` operation. */
export type CustomRemoteModule = 'office365' | 'googleworkspace';

/** A single permission status entry returned by the custom-remote `CheckPermissions` operation. */
export type CustomRemotePermissionStatus = {
  name: string;
  description: string;
  requiredForBackup: boolean;
  requiredForRestore: boolean;
  enabled: boolean;
};

export function isOffice365LegacySiteCounts(sites: Office365SiteCountsResponse): sites is Office365LegacySiteCounts {
  return !('personalLicensedUser' in sites);
}

export function normalizeOffice365SiteCounts(sites: Office365SiteCountsResponse): Office365SiteCounts {
  if (isOffice365LegacySiteCounts(sites)) {
    return {
      ...sites,
      personal: sites.personal,
      personalLicensedUser: null,
      personalUnlicensedUser: null,
    };
  }

  const { personalLicensedUser, personalUnlicensedUser, ...rest } = sites;
  return {
    ...rest,
    personal: personalLicensedUser + personalUnlicensedUser,
    personalLicensedUser,
    personalUnlicensedUser,
  };
}

@Injectable({
  providedIn: 'root',
})
export class WebModulesService {
  #dupServer = inject(DuplicatiServer);
  #http = inject(HttpClient);
  #relayconfigState = inject(RelayconfigState);

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
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 's3-getconfig' },
        body: {
          's3-config': config,
        },
      })
    ).pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  createS3IamUser(username: string, password: string) {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 's3-iamconfig' },
        body: {
          's3-operation': 'CanCreateUser',
          's3-username': username,
          's3-password': password,
        },
      })
    );
  }

  createS3PolicyIAM(path: string) {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 's3-iamconfig' },
        body: {
          's3-operation': 'GetPolicyDoc',
          path, // "${bucketname}/{path on server}"
        },
      })
    );
  }

  private getStorjConfig(config: 'Satellites' | 'AuthenticationMethods') {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'storj-getconfig' },
        body: {
          'storj-config': config,
        },
      })
    ).pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  private getOpenstackConfig(config: 'Providers' | 'Versions') {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'openstack-getconfig' },
        body: {
          'openstack-config': config,
        },
      })
    ).pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  private getGcsConfig(config: 'Locations' | 'StorageClasses') {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'gcs-getconfig' },
        body: {
          'gcs-config': config,
        },
      })
    ).pipe(map((x) => this.#defaultMapResultObjToArray(x)));
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
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'duplicati-list-backups' },
        body: {
          action: 'ListBackups',
          url,
        },
      })
    ).pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'folders')?.value as string),
        map((folders) => JSON.parse(folders) as string[])
      );
  }

  getFilenApiKey(url: string, backupId?: string | null) {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'filen-get-api-key' },
        body: {
          'filen-operation': 'GetApiKey',
          'backup-id': backupId ?? '',
          url,
        },
      })
    ).pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'api-key')?.value as string)
      );
  }

  /**
   * Counts the number of top-level Microsoft 365 items (users, groups, sites)
   * for the given destination URL, broken down by license seat usage and sub-type.
   *
   * Counting items in a large tenant can take a while, so when the websocket
   * relay proxy is active a `timeout` header is sent to extend the relayed
   * request timeout beyond the default.
   */
  getOffice365Counts(url: string, sourcePrefix: string, backupId: string | null) {
    // The websocket relay interceptor reads the timeout from this header
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.#relayconfigState.relayIsEnabled()) {
      headers['timeout'] = `${5 * 60 * 1000}`;
    }

    return this.#http
      .post<WebModuleOutputDto>(
        `${getApiBase()}/api/v1/webmodule/office365`,
        // The websocket relay only supports string bodies, so serialize here
        JSON.stringify({
          'backup-id': backupId ?? '',
          'source-prefix': sourcePrefix,
          operation: 'CountItems',
          url,
        }),
        { headers }
      )
      .pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'counts')?.value as string),
        map((counts) => {
          const raw = JSON.parse(counts) as Office365RawCounts;
          return {
            users: raw.users,
            groups: raw.groups,
            sites: normalizeOffice365SiteCounts(raw.sites),
          };
        })
      );
  }

  /**
   * Checks the Microsoft 365 permissions granted to the app registration
   * for the given destination URL, indicating which are required for
   * backup and/or restore and whether they are currently enabled.
   */
  getOffice365Permissions(url: string, sourcePrefix: string, backupId: string | null) {
    return this.#getCustomRemotePermissions('office365', url, sourcePrefix, backupId);
  }

  /**
   * Checks the Google Workspace permissions granted to the service account
   * for the given destination URL, indicating which are required for
   * backup and/or restore and whether they are currently enabled.
   */
  getGsuitePermissions(url: string, sourcePrefix: string, backupId: string | null) {
    return this.#getCustomRemotePermissions('googleworkspace', url, sourcePrefix, backupId);
  }

  #getCustomRemotePermissions(module: CustomRemoteModule, url: string, sourcePrefix: string, backupId: string | null) {
    return this.#http
      .post<WebModuleOutputDto>(
        `${getApiBase()}/api/v1/webmodule/${module}`,
        JSON.stringify({
          'backup-id': backupId ?? '',
          'source-prefix': sourcePrefix,
          operation: 'CheckPermissions',
          url,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
      .pipe(
        map((x) => this.#defaultMapResultObjToArray(x)),
        map((res) => res.find((r) => r.key === 'permissions')?.value as string),
        map((permissions) => JSON.parse(permissions) as CustomRemotePermissionStatus[])
      );
  }
}
