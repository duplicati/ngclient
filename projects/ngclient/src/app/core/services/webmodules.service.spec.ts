import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, WebModuleOutputDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';
import { isOffice365LegacySiteCounts, normalizeOffice365SiteCounts, WebModulesService } from './webmodules.service';

describe('WebModulesService S3 configuration', () => {
  let pendingRequests: Subject<WebModuleOutputDto>[] = [];

  afterEach(() => {
    pendingRequests.forEach((request) => request.complete());
    pendingRequests = [];
    TestBed.resetTestingModule();
  });

  const setup = () => {
    const requests = new Map<string, Subject<WebModuleOutputDto>>();
    const server = {
      postApiV1WebmoduleByModulekey: vi.fn(
        (request: { path: { modulekey: string }; body: { 's3-config': string } }) => {
          const response = new Subject<WebModuleOutputDto>();
          pendingRequests.push(response);
          requests.set(request.body['s3-config'], response);
          return response;
        }
      ),
    };
    const http = { post: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        WebModulesService,
        { provide: DuplicatiServer, useValue: server },
        { provide: HttpClient, useValue: http },
        { provide: RelayconfigState, useValue: { relayIsEnabled: () => false } },
      ],
    });
    const service = TestBed.inject(WebModulesService);
    const respond = (config: string, response: WebModuleOutputDto) => {
      const request = requests.get(config)!;
      request.next(response);
      request.complete();
    };
    return { service, server, http, respond };
  };

  it.each([
    { config: 'Providers', getter: 'getS3Providers' },
    { config: 'Regions', getter: 'getS3Regions' },
    { config: 'RegionHosts', getter: 'getS3RegionHosts' },
    { config: 'StorageClasses', getter: 'getS3StorageClasses' },
  ] as const)('loads $config lazily, maps the response, and reuses the result', ({ config, getter }) => {
    const { service, server, http, respond } = setup();
    expect(server.postApiV1WebmoduleByModulekey).not.toHaveBeenCalled();
    const value = service[getter]();
    expect(value()).toBeUndefined();
    service[getter]();
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledExactlyOnceWith({
      path: { modulekey: 's3-getconfig' },
      body: { 's3-config': config },
    });

    respond(config, { Result: { First: 'first-value', Second: 'second-value' } });
    const expected = [
      { key: 'First', value: 'first-value' },
      { key: 'Second', value: 'second-value' },
    ];
    expect(value()).toEqual(expected);
    expect(service[getter]()()).toEqual(expected);
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(1);
    expect(http.post).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'empty object', response: { Result: {} } },
    { name: 'null', response: { Result: null } },
    { name: 'missing Result', response: {} },
  ])('maps $name to an empty option list', ({ response }) => {
    const { service, respond } = setup();
    const value = service.getS3Providers();
    respond('Providers', response);
    expect(value()).toEqual([]);
  });

  it.each(['Providers', 'RegionHosts'])('updates the merged list when %s responds first', (first) => {
    const { service, server, respond } = setup();
    const value = service.getS3AllProviders();
    expect(value()).toEqual([]);
    service.getS3AllProviders();
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(2);
    const provider = { key: 'Custom', value: 'custom.example.com' };
    const region = { key: 'Amazon Europe', value: 's3.eu.example.com' };
    const responses = {
      Providers: { Result: { Custom: provider.value } },
      RegionHosts: { Result: { Europe: region.value } },
    };
    const firstConfig = first as keyof typeof responses;
    const secondConfig = firstConfig === 'Providers' ? 'RegionHosts' : 'Providers';
    respond(firstConfig, responses[firstConfig]);
    expect(value()).toEqual([firstConfig === 'Providers' ? provider : region]);
    respond(secondConfig, responses[secondConfig]);
    expect(value()).toHaveLength(2);
    expect(value()).toEqual(expect.arrayContaining([provider, region]));
    service.getS3AllProviders();
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(2);
  });

  it('deduplicates providers by endpoint without removing distinct endpoints', () => {
    const { service, respond } = setup();
    const value = service.getS3AllProviders();
    respond('Providers', { Result: { Shared: 'shared.example.com', Custom: 'custom.example.com' } });
    respond('RegionHosts', { Result: { SharedRegion: 'shared.example.com', Europe: 'eu.example.com' } });
    expect(
      value()
        .map((option) => option.value)
        .sort()
    ).toEqual(['custom.example.com', 'eu.example.com', 'shared.example.com']);
  });

  it('applies the predicate to providers that arrive after the filtered signal is created', () => {
    const { service, server, respond } = setup();
    const value = service.getS3ProvidersFiltered((option) => option.value.endsWith('.allowed.example'));
    expect(value()).toEqual([]);
    respond('Providers', { Result: { Keep: 'custom.allowed.example', Omit: 'other.example' } });
    expect(value()).toEqual([{ key: 'Keep', value: 'custom.allowed.example' }]);
    respond('RegionHosts', { Result: { Europe: 'eu.allowed.example', Other: 'other-region.example' } });
    expect(value()).toEqual([
      { key: 'Keep', value: 'custom.allowed.example' },
      { key: 'Amazon Europe', value: 'eu.allowed.example' },
    ]);
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledTimes(2);
  });
});

describe('Office 365 site count normalization', () => {
  const common = { group: 2, classic: 3, communication: 4, other: 1 };

  it.each([0, 5])('preserves legacy personal counts (%s) without inventing a breakdown', (personal) => {
    const input = Object.freeze({ ...common, total: 10 + personal, personal });
    expect(isOffice365LegacySiteCounts(input)).toBe(true);
    const result = normalizeOffice365SiteCounts(input);
    expect(result).toEqual({ ...input, personalLicensedUser: null, personalUnlicensedUser: null });
    expect(result).not.toBe(input);
    expect(input).toEqual({ ...common, total: 10 + personal, personal });
  });

  it.each([
    { personalLicensedUser: 0, personalUnlicensedUser: 0 },
    { personalLicensedUser: 2, personalUnlicensedUser: 3 },
  ])('sums the new breakdown $personalLicensedUser + $personalUnlicensedUser', (breakdown) => {
    const personal = breakdown.personalLicensedUser + breakdown.personalUnlicensedUser;
    const input = Object.freeze({ ...common, total: 10 + personal, ...breakdown });
    expect(isOffice365LegacySiteCounts(input)).toBe(false);
    const result = normalizeOffice365SiteCounts(input);
    expect(result).toEqual({ ...input, personal });
    expect(result).not.toBe(input);
    expect(input).toEqual({ ...common, total: 10 + personal, ...breakdown });
  });
});
