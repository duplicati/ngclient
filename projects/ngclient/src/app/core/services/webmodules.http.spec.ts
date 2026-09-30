import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable, Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { client } from '../openapi/client.gen';
import { RelayconfigState } from '../states/relayconfig.state';
import {
  CustomRemotePermissionStatus,
  GoogleWorkspaceCounts,
  Office365RawCounts,
  WebModulesService,
} from './webmodules.service';

const operations = [
  { method: 'getOffice365Counts', module: 'office365', operation: 'CountItems', result: 'counts' },
  { method: 'getGoogleWorkspaceCounts', module: 'googleworkspace', operation: 'CountItems', result: 'counts' },
  {
    method: 'getOffice365Permissions',
    module: 'office365',
    operation: 'CheckPermissions',
    result: 'permissions',
  },
  {
    method: 'getGsuitePermissions',
    module: 'googleworkspace',
    operation: 'CheckPermissions',
    result: 'permissions',
  },
] as const;

const counts: Office365RawCounts = {
  users: { total: 10, licensed: 4, unlicensed: 3, sharedMailboxWithStorage: 2, sharedMailboxWithoutStorage: 1 },
  groups: { total: 5, unified: 2, notUnified: 3 },
  sites: { total: 15, group: 1, classic: 2, communication: 3, personal: 4, other: 5 },
};

const googleCounts: GoogleWorkspaceCounts = {
  users: { total: 10, active: 6, suspended: 3, archived: 1 },
  groups: { total: 5 },
  sharedDrives: { total: 2 },
  sites: { total: 7 },
};

const permissions: CustomRemotePermissionStatus[] = [
  { name: 'read', description: 'Read items', requiredForBackup: true, requiredForRestore: false, enabled: true },
  { name: 'write', description: 'Write items', requiredForBackup: false, requiredForRestore: true, enabled: false },
];

describe('WebModulesService HTTP operations', () => {
  const subscriptions: Subscription[] = [];
  let http: HttpTestingController;
  let originalBaseUrl: ReturnType<typeof client.getConfig>['baseUrl'];

  beforeEach(() => {
    originalBaseUrl = client.getConfig().baseUrl;
    client.setConfig({ baseUrl: '/test-proxy' });
  });

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
      TestBed.resetTestingModule();
      client.setConfig({ baseUrl: originalBaseUrl });
      vi.restoreAllMocks();
    }
  });

  function setup(relayEnabled = false) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        WebModulesService,
        { provide: DuplicatiServer, useValue: {} },
        { provide: RelayconfigState, useValue: { relayIsEnabled: () => relayEnabled } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(WebModulesService);
  }

  function observe(source: Observable<unknown>) {
    const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() };
    subscriptions.push(source.subscribe(observer));
    return observer;
  }

  describe.each(operations)('$method', ({ method, module, operation, result }) => {
    const endpoint = `/test-proxy/api/v1/webmodule/${module}`;

    it.each(['backup-42', null])('posts a serialized request with backup ID %s', (backupId) => {
      const service = setup();
      const observer = observe(service[method]('source://tenant/path?key=value', 'source-1', backupId));
      const request = http.expectOne(endpoint);

      expect(request.request.method).toBe('POST');
      expect(request.request.headers.get('Content-Type')).toBe('application/json');
      expect(typeof request.request.body).toBe('string');
      expect(JSON.parse(request.request.body)).toEqual({
        'backup-id': backupId ?? '',
        'source-prefix': 'source-1',
        operation,
        url: 'source://tenant/path?key=value',
      });
      expect(observer.next).not.toHaveBeenCalled();
      expect(observer.complete).not.toHaveBeenCalled();

      const payload = result !== 'counts' ? permissions : module === 'office365' ? counts : googleCounts;
      request.flush({ Result: { [result]: JSON.stringify(payload) } });

      expect(observer.next).toHaveBeenCalledTimes(1);
      expect(observer.complete).toHaveBeenCalledTimes(1);
      expect(observer.error).not.toHaveBeenCalled();
      expect(observer.next.mock.invocationCallOrder[0]).toBeLessThan(observer.complete.mock.invocationCallOrder[0]);
    });

    it('propagates an HTTP error without a success result', () => {
      const service = setup();
      const observer = observe(service[method]('source://tenant', 'source-1', 'backup-42'));

      http.expectOne(endpoint).flush({ Error: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' });

      expect(observer.error).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 503, error: { Error: 'Unavailable' } })
      );
      expect(observer.error.mock.calls[0][0]).toBeInstanceOf(HttpErrorResponse);
      expect(observer.next).not.toHaveBeenCalled();
      expect(observer.complete).not.toHaveBeenCalled();
    });

    it('propagates invalid result JSON without a success result', () => {
      const service = setup();
      const observer = observe(service[method]('source://tenant', 'source-1', null));

      http.expectOne(endpoint).flush({ Result: { [result]: '{invalid-json' } });

      expect(observer.error).toHaveBeenCalledExactlyOnceWith(expect.any(SyntaxError));
      expect(observer.next).not.toHaveBeenCalled();
      expect(observer.complete).not.toHaveBeenCalled();
    });
  });

  describe.each(operations.filter((operation) => operation.result === 'counts'))(
    '$method headers',
    ({ method, module }) => {
      it.each([false, true])('sets the count timeout header only with relay enabled (%s)', (relayEnabled) => {
        const service = setup(relayEnabled);
        const observer = observe(service[method](`${module}://tenant`, 'source-1', null));
        const request = http.expectOne(`/test-proxy/api/v1/webmodule/${module}`);

        expect(request.request.headers.get('timeout')).toBe(relayEnabled ? '300000' : null);
        request.flush({ Result: { counts: JSON.stringify(module === 'office365' ? counts : googleCounts) } });
        expect(observer.error).not.toHaveBeenCalled();
        expect(observer.complete).toHaveBeenCalledTimes(1);
      });
    }
  );

  it('parses Google Workspace counts without transformation', () => {
    const service = setup();
    const observer = observe(service.getGoogleWorkspaceCounts('googleworkspace://tenant', 'source-1', null));

    http.expectOne('/test-proxy/api/v1/webmodule/googleworkspace').flush({
      Result: { counts: JSON.stringify(googleCounts) },
    });

    expect(observer.next).toHaveBeenCalledExactlyOnceWith(googleCounts);
    expect(observer.complete).toHaveBeenCalledTimes(1);
    expect(observer.error).not.toHaveBeenCalled();
  });

  it.each([
    {
      format: 'legacy',
      sites: counts.sites,
      expected: { ...counts.sites, personalLicensedUser: null, personalUnlicensedUser: null },
    },
    {
      format: 'new',
      sites: {
        total: 21,
        group: 1,
        classic: 2,
        communication: 3,
        personalLicensedUser: 4,
        personalUnlicensedUser: 5,
        other: 6,
      },
      expected: {
        total: 21,
        group: 1,
        classic: 2,
        communication: 3,
        personal: 9,
        personalLicensedUser: 4,
        personalUnlicensedUser: 5,
        other: 6,
      },
    },
  ])('parses counts and normalizes $format sites', ({ sites, expected }) => {
    const service = setup();
    const observer = observe(service.getOffice365Counts('office365://tenant', 'source-1', null));

    http.expectOne('/test-proxy/api/v1/webmodule/office365').flush({
      Result: { counts: JSON.stringify({ ...counts, sites }) },
    });

    expect(observer.next).toHaveBeenCalledExactlyOnceWith({
      users: counts.users,
      groups: counts.groups,
      sites: expected,
    });
    expect(observer.complete).toHaveBeenCalledTimes(1);
    expect(observer.error).not.toHaveBeenCalled();
  });

  describe.each(operations.filter((operation) => operation.result === 'permissions'))(
    '$method results',
    ({ method, module }) => {
      it.each([{ entries: permissions }, { entries: [] }])('preserves permission entries: $entries', ({ entries }) => {
        const service = setup();
        const observer = observe(service[method]('source://tenant', 'source-1', null));

        http.expectOne(`/test-proxy/api/v1/webmodule/${module}`).flush({
          Result: { permissions: JSON.stringify(entries) },
        });

        expect(observer.next).toHaveBeenCalledExactlyOnceWith(entries);
        expect(observer.complete).toHaveBeenCalledTimes(1);
        expect(observer.error).not.toHaveBeenCalled();
      });
    }
  );
});
