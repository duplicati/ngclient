// '/webmodule/s3-getconfig', {'s3-config': 'Providers'}
// '/webmodule/s3-getconfig', {'s3-config': 'Regions'}
// '/webmodule/s3-getconfig', {'s3-config': 'StorageClasses'}

// '/webmodule/s3-iamconfig'
// 's3-operation': 'CreateIAMUser'
// 's3-operation': 'GetPolicyDoc'

// '/webmodule/storj-getconfig', {'storj-config': 'Satellites'}
// '/webmodule/storj-getconfig', {'storj-config': 'AuthenticationMethods'}

// '/webmodule/openstack-getconfig', {'openstack-config': 'Providers'}
// '/webmodule/openstack-getconfig', {'openstack-config': 'Versions'}

// '/webmodule/gcs-getconfig', {'gcs-config': 'Locations'}
// '/webmodule/gcs-getconfig', {'gcs-config': 'StorageClasses'}

import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { DuplicatiServerService, WebModuleOutputDto } from '../openapi';

export type WebModuleOption = { key: string; value: any };

@Injectable({
  providedIn: 'root',
})
export class WebModulesService {
  #dupServer = inject(DuplicatiServerService);

  s3Providers = toSignal(this.getS3Config('Providers'));
  s3Regions = toSignal(this.getS3Config('Regions'));
  s3RegionHosts = toSignal(this.getS3Config('RegionHosts'));
  s3StorageClasses = toSignal(this.getS3Config('StorageClasses'));

  storjSatellites = toSignal(this.getStorjConfig('Satellites'));
  storjAuthenticationMethods = toSignal(this.getStorjConfig('AuthenticationMethods'));

  openstackProviders = toSignal(this.getOpenstackConfig('Providers'));
  openstackVersions = toSignal(this.getOpenstackConfig('Versions'));

  gcsLocations = toSignal(this.getGcsConfig('Locations'));
  gcsStorageClasses = toSignal(this.getGcsConfig('StorageClasses'));

  getS3Config(config: 'Providers' | 'Regions' | 'RegionHosts' | 'StorageClasses') {
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

  getStorjConfig(config: 'Satellites' | 'AuthenticationMethods') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'storj-getconfig',
        requestBody: {
          'storj-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  getOpenstackConfig(config: 'Providers' | 'Versions') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'openstack-getconfig',
        requestBody: {
          'openstack-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x)));
  }

  getGcsConfig(config: 'Locations' | 'StorageClasses') {
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
