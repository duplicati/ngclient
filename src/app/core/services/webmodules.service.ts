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
import { map, Observable } from 'rxjs';
import { DuplicatiServerService, WebModuleOutputDto } from '../openapi';

export type WebModuleOption = { key: string; value: any };

@Injectable({
  providedIn: 'root',
})
export class WebModulesService {
  #dupServer = inject(DuplicatiServerService);

  #defaultMapResultObjToArray(x: WebModuleOutputDto) {
    return (
      (x.Result &&
        typeof x.Result === 'object' &&
        Object.entries(x.Result).map(([key, value]) => ({
          key,
          value,
        }))) ??
      []
    );
  }

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

  gcsConfigLocations = toSignal(this.getGcsConfig('Locations'));
  gcsConfigStorageClasses = toSignal(this.getGcsConfig('StorageClasses'));

  getGcsConfig(config: 'Locations' | 'StorageClasses') {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'gcs-getconfig',
        requestBody: {
          'gcs-config': config,
        },
      })
      .pipe(map((x) => this.#defaultMapResultObjToArray(x))) as Observable<WebModuleOption[]>;
  }
}
