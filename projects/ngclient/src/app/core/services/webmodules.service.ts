import { computed, inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { LazySignal } from '../functions/lazy-signal';
import { DuplicatiServerService, WebModuleOutputDto } from '../openapi';

export type WebModuleOption = { key: string; value: any };


@Injectable({
  providedIn: 'root',
})
export class WebModulesService {
  #dupServer = inject(DuplicatiServerService);

  #s3Providers = new LazySignal(() => this.getS3Config('Providers'));
  #s3Regions = new LazySignal(() => this.getS3Config('Regions'));
  #s3RegionHosts = new LazySignal(() => this.getS3Config('RegionHosts'));
  #s3StorageClasses = new LazySignal(() => this.getS3Config('StorageClasses'));
  #s3AllProviders = computed(() => {
    const providers = this.#s3Providers.value()();
    const regionHosts = this.#s3RegionHosts.value()();

    const merged = [
      ...(providers ?? []),
      ...(regionHosts?.map(x => ({ key: `Amazon ${x.key}`, value: x.value })) ?? []),
    ];
    
    return Array.from(
      new Map(merged.map(item => [item.value, item])).values()
    );
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

  getS3Providers() {return this.#s3Providers.load(); }
  getS3Regions() {return this.#s3Regions.load(); }
  getS3RegionHosts() {return this.#s3RegionHosts.load(); }
  getS3StorageClasses() {return this.#s3StorageClasses.load(); }
  getStorjSatellites() {return this.#storjSatellites.load(); }
  getStorjAuthenticationMethods() {return this.#storjAuthenticationMethods.load(); }
  getOpenstackProviders() {return this.#openstackProviders.load(); }
  getOpenstackVersions() {return this.#openstackVersions.load(); }
  getGcsLocations() {return this.#gcsLocations.load(); }
  getGcsStorageClasses() {return this.#gcsStorageClasses.load(); }

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
}
