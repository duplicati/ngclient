import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, WebModuleOutputDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';
import { WebModulesService } from './webmodules.service';

const configurations = [
  { getter: 'getStorjSatellites', module: 'storj-getconfig', key: 'storj-config', config: 'Satellites' },
  { getter: 'getOpenstackProviders', module: 'openstack-getconfig', key: 'openstack-config', config: 'Providers' },
  { getter: 'getOpenstackVersions', module: 'openstack-getconfig', key: 'openstack-config', config: 'Versions' },
  { getter: 'getGcsLocations', module: 'gcs-getconfig', key: 'gcs-config', config: 'Locations' },
  { getter: 'getGcsStorageClasses', module: 'gcs-getconfig', key: 'gcs-config', config: 'StorageClasses' },
] as const;

describe('WebModulesService backend configuration', () => {
  let pending: Subject<WebModuleOutputDto>[] = [];

  afterEach(() => {
    pending.forEach((response) => response.complete());
    pending = [];
    TestBed.resetTestingModule();
  });

  const setup = () => {
    const requests: {
      request: Parameters<DuplicatiServer['postApiV1WebmoduleByModulekey']>[0];
      response: Subject<WebModuleOutputDto>;
    }[] = [];
    const server = {
      postApiV1WebmoduleByModulekey: vi.fn(
        (request: Parameters<DuplicatiServer['postApiV1WebmoduleByModulekey']>[0]) => {
          const response = new Subject<WebModuleOutputDto>();
          pending.push(response);
          requests.push({ request, response });
          return response.asObservable();
        }
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        WebModulesService,
        { provide: DuplicatiServer, useValue: server },
        { provide: HttpClient, useValue: { post: vi.fn() } },
        { provide: RelayconfigState, useValue: { relayIsEnabled: () => false } },
      ],
    });
    return { service: TestBed.inject(WebModulesService), server, requests };
  };

  it.each(configurations)('loads $getter lazily and reuses its mapped result', ({ getter, module, key, config }) => {
    const { service, server, requests } = setup();
    expect(server.postApiV1WebmoduleByModulekey).not.toHaveBeenCalled();
    const value = service[getter]();
    expect(value()).toBeUndefined();
    const secondValue = service[getter]();
    expect(secondValue()).toBeUndefined();
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledExactlyOnceWith({
      path: { modulekey: module },
      body: { [key]: config },
    });

    requests[0].response.next({ Result: { First: 'first-value', Second: 'second-value' } });
    requests[0].response.complete();
    const expected = [
      { key: 'First', value: 'first-value' },
      { key: 'Second', value: 'second-value' },
    ];
    expect(value()).toEqual(expected);
    expect(secondValue()).toEqual(expected);
    expect(service[getter]()()).toEqual(expected);
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(1);
  });

  it.each(configurations)('maps an empty $getter result to an empty cached list', ({ getter }) => {
    const { service, server, requests } = setup();
    const value = service[getter]();
    requests[0].response.next({ Result: {} });
    requests[0].response.complete();
    expect(value()).toEqual([]);
    expect(service[getter]()()).toEqual([]);
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(1);
  });

  it.each([{ order: [4, 2, 0, 3, 1] }, { order: [1, 3, 0, 2, 4] }])(
    'keeps concurrent configuration responses separate in order $order',
    ({ order }) => {
      const { service, server, requests } = setup();
      const values = configurations.map(({ getter }) => service[getter]());
      expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(configurations.length);
      configurations.forEach(({ module, key, config }, index) => {
        expect(requests[index].request).toEqual({ path: { modulekey: module }, body: { [key]: config } });
        expect(values[index]()).toBeUndefined();
      });

      const completed = new Set<number>();
      for (const index of order) {
        requests[index].response.next({ Result: { Choice: `value-${index}` } });
        requests[index].response.complete();
        completed.add(index);
        values.forEach((value, current) => {
          expect(value()).toEqual(completed.has(current) ? [{ key: 'Choice', value: `value-${current}` }] : undefined);
        });
      }
      configurations.forEach(({ getter }, index) => {
        expect(service[getter]()()).toEqual([{ key: 'Choice', value: `value-${index}` }]);
      });
      expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(configurations.length);
    }
  );
});
