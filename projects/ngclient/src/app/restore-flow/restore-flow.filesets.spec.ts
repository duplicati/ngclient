import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { defer } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_TOKEN } from '../../environments/environment-token';
import { httpInterceptor } from '../core/interceptors/http.interceptor';
import { DuplicatiServer } from '../core/openapi';
import { client } from '../core/openapi/client.gen';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { AppAuthState } from '../core/states/app-auth.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { RestoreFlowState } from './restore-flow.state';

const backupUrl = '/api/v1/backup/42';
const filesetsUrl = '/api/v2/backup/list-filesets';
const activityUrl = `${backupUrl}/isactive`;
const fileset = {
  Version: 0,
  IsFullBackup: true,
  Time: '2026-11-06T00:00:00Z',
  FileCount: 1,
  FileSizes: 3,
  Label: 'First backup',
};
const success = {
  Success: true,
  Error: null,
  StatusCode: 'OK',
  Data: [fileset],
  PageInfo: { Total: 1, Page: 1, Pages: 1, PageSize: 1 },
};
const locked = {
  Success: false,
  Error: 'Database in use',
  StatusCode: 'DatabaseLocked',
  Data: null,
  PageInfo: null,
};

describe('RestoreFlowState fileset/backup HTTP ordering', () => {
  let http: HttpTestingController;
  let originalConfig: ReturnType<typeof client.getConfig>;
  let flushActivity: () => boolean;
  beforeEach(() => {
    vi.useFakeTimers();
    originalConfig = client.getConfig();
  });
  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
      client.setConfig({ ...originalConfig, httpClient: originalConfig.httpClient });
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
  function setup(v2 = true) {
    const open = vi.fn();
    const navigate = vi.fn();
    const alert = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpInterceptor])),
        provideHttpClientTesting(),
        RestoreFlowState,
        DuplicatiServer,
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: {} },
        { provide: ShipDialogService, useValue: { open } },
        { provide: ShipAlertService, useValue: { error: alert } },
        {
          provide: AppAuthState,
          useValue: { token: () => 'restore-test-token', refreshToken: vi.fn(), logout: vi.fn() },
        },
        { provide: LOCALSTORAGE, useValue: { getItem: () => 'en-US' } },
        { provide: ENVIRONMENT_TOKEN, useValue: { baseUrl: '/api' } },
        {
          provide: SysinfoState,
          useValue: {
            hasV2ListOperations: () => v2,
            hasRestoreOptions: () => false,
            hasRegisterRestoredItems: () => false,
          },
        },
        { provide: ServerSettingsService, useValue: { serverSettings: signal({}) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client.setConfig({ baseUrl: '', httpClient: TestBed.inject(HttpClient), throwOnError: true });
    const state = TestBed.inject(RestoreFlowState);
    state.backupId.set('42');
    const backupReads: boolean[] = [];
    let active = false;
    const activityReads: string[] = [];
    flushActivity = () => {
      const requests = http.match((request) => request.url.endsWith('/isactive'));
      for (const request of requests) {
        activityReads.push(request.request.url);
        request.flush({ Status: 'OK', Active: active });
      }
      return requests.length > 0;
    };
    function flushBackup(exists: boolean, isTemporary = false) {
      const requests = http.match(backupUrl);
      for (const request of requests) {
        backupReads.push(exists);
        request.flush({ Backup: { ID: '42', Settings: [], IsTemporary: isTemporary, DBPathExists: exists } });
      }
    }
    function flushFilesets(body: typeof success | typeof locked = success) {
      const request = http.expectOne(filesetsUrl);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ BackupId: '42' });
      // Deliberately HTTP 200: the real interceptor must turn Success:false into an error.
      request.flush(body, { status: 200, statusText: 'OK' });
    }
    return {
      state,
      open,
      navigate,
      alert,
      backupReads,
      flushBackup,
      flushFilesets,
      activityReads,
      setActive: (value: boolean) => (active = value),
    };
  }
  const settle = async () => {
    await vi.advanceTimersByTimeAsync(0);
    while (flushActivity()) await vi.advanceTimersByTimeAsync(0);
  };

  it('reads current backup metadata after a DatabaseLocked retry succeeds', async () => {
    const { state, open, backupReads, flushBackup, flushFilesets } = setup();
    state.getBackup();
    await settle();
    flushBackup(false); // A read before the successful listing sees no database yet.
    flushFilesets(locked);
    await settle();
    expect(state.versionOptionsLoading()).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    http.expectNone(filesetsUrl);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    flushFilesets();
    await settle();
    flushBackup(true); // The successful listing completed after the database was created.
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(backupReads).toEqual([true]);
    expect(state.versionOptions()).toEqual([fileset]);
    expect(state.backup()?.Backup?.DBPathExists).toBe(true);
    expect(state.versionOptionsLoading()).toBe(false);
  });

  it('still reports a genuinely missing database and opens the existing repair route', async () => {
    const { state, open, navigate, flushBackup, flushFilesets } = setup();
    state.getBackup();
    await settle();
    flushBackup(false);
    flushFilesets();
    await settle();
    flushBackup(false);
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1].data).toEqual({
      title: 'Missing Local Database',
      message:
        'The local database for this backup is missing. Please repair or recreate the local database before restoring.',
      confirmText: 'OK',
      cancelText: undefined,
    });
    expect(navigate).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup', '42', 'database']);
    expect(state.versionOptions()).toEqual([]);
    expect(state.versionOptionsLoading()).toBe(false);
  });

  it('does not report a missing database for a temporary backup', async () => {
    const { state, open, flushBackup, flushFilesets } = setup();
    state.getBackup();
    await settle();
    flushBackup(false, true);
    flushFilesets();
    await settle();
    flushBackup(false, true);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(state.versionOptions()).toEqual([fileset]);
    expect(state.backup()?.Backup?.IsTemporary).toBe(true);
    expect(state.versionOptionsLoading()).toBe(false);
  });

  it('converts HTTP 200 DatabaseLocked through the actual client and interceptor', async () => {
    const { alert, flushFilesets } = setup();
    const error = vi.fn();
    const next = vi.fn();
    defer(() => TestBed.inject(DuplicatiServer).postApiV2BackupListFilesets({ body: { BackupId: '42' } })).subscribe({
      next,
      error,
    });
    await settle();
    flushFilesets(locked);
    await settle();
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'Database in use',
        error: expect.objectContaining({ status: 200, requestBody: locked }),
      })
    );
    expect(error.mock.calls[0][0].error.requestBody.StatusCode).toBe('DatabaseLocked');
    expect(alert).toHaveBeenCalledWith('Database in use');
  });

  it('keeps a persistently locked database on the current restore page', async () => {
    const { state, open, navigate, flushBackup, flushFilesets } = setup();
    const startedAt = Date.now();
    state.getBackup();
    await settle();
    flushBackup(false);
    for (let attempt = 0; attempt < 3; attempt++) {
      flushFilesets(locked);
      await settle();
      if (attempt < 2) {
        expect(open).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(999);
        http.expectNone(filesetsUrl);
        await vi.advanceTimersByTimeAsync(1);
        await settle();
      }
    }
    expect(Date.now() - startedAt).toBe(2000);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1].data.title).toBe('Backup database is busy');
    expect(open.mock.calls[0][1].data.confirmText).toBe('Retry');
    expect(state.versionOptions()).toEqual([]);
    expect(state.versionOptionsLoading()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    http.expectNone(filesetsUrl);
  });

  it('waits for a queued/starting backup before listing versions even before it owns the database lock', async () => {
    const { state, open, flushBackup, flushFilesets, setActive } = setup();
    setActive(true);
    state.getBackup();
    await settle();
    // The old implementation could list the remote store successfully before the DB was created.
    const early = http.match(filesetsUrl);
    for (const request of early) request.flush(success);
    await settle();
    flushBackup(false);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(early).toHaveLength(0);
    expect(state.versionOptions()).toEqual([]);
    expect(state.versionOptionsLoading()).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    await settle();
    http.expectNone(filesetsUrl);
    setActive(false);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    flushFilesets();
    await settle();
    flushBackup(true);
    await settle();
    expect(state.versionOptions()).toEqual([fileset]);
    expect(open).not.toHaveBeenCalled();
    expect(state.versionOptionsLoading()).toBe(false);
  });

  it('waits instead of exhausting retries if a backup acquires the lock after the initial idle check', async () => {
    const { state, open, flushFilesets, flushBackup, setActive } = setup();
    state.getBackup();
    await settle();
    flushFilesets(locked);
    await settle();
    setActive(true);
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      // Complete any incorrect eager retries, making the former exhaustion behavior observable.
      for (const request of http.match(filesetsUrl)) request.flush(locked);
      await settle();
    }
    expect(open).not.toHaveBeenCalled();
    expect(state.versionOptionsLoading()).toBe(true);
    setActive(false);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    flushFilesets();
    await settle();
    flushBackup(true);
    await settle();
    expect(state.versionOptions()).toEqual([fileset]);
    expect(open).not.toHaveBeenCalled();
  });

  it('rechecks activity before reporting a missing DB and reloads versions after that backup finishes', async () => {
    const { state, open, flushFilesets, flushBackup, setActive } = setup();
    state.getBackup();
    await settle();
    flushFilesets();
    await settle();
    setActive(true);
    flushBackup(false);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(state.versionOptionsLoading()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    http.expectNone(filesetsUrl);
    setActive(false);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    const newer = { ...fileset, Version: 1 };
    http.expectOne(filesetsUrl).flush({ ...success, Data: [newer] });
    await settle();
    flushBackup(true);
    await settle();
    expect(state.versionOptions()).toEqual([newer]);
    expect(open).not.toHaveBeenCalled();
  });

  it('offers a same-page retry after persistent locks and succeeds when the lock is released', async () => {
    const { state, open, navigate, flushFilesets, flushBackup } = setup();
    state.getBackup();
    await settle();
    for (let i = 0; i < 3; i++) {
      flushFilesets(locked);
      await settle();
      if (i < 2) {
        await vi.advanceTimersByTimeAsync(1000);
        await settle();
      }
    }
    expect(open.mock.calls[0][1].data.confirmText).toBe('Retry');
    open.mock.calls[0][1].closed(true);
    await settle();
    flushFilesets();
    await settle();
    flushBackup(true);
    await settle();
    expect(state.versionOptions()).toEqual([fileset]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stops waiting and prevents new requests when the restore state is destroyed', async () => {
    const { state, open, setActive, flushFilesets, flushBackup } = setup();
    setActive(true);
    state.getBackup();
    await settle();
    // Consume the old implementation's eager request so teardown does not hide the lifecycle regression.
    const eager = http.match(filesetsUrl);
    TestBed.resetTestingModule();
    for (const request of eager) request.flush(success);
    await settle();
    flushBackup(true);
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    expect(state.versionOptions()).toEqual([]);
    expect(state.versionOptionsLoading()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    http.expectNone(activityUrl);
  });

  it('keeps the V1 parallel listing path without a missing-database dialog', async () => {
    const { state, open } = setup(false);
    state.getBackup();
    await settle();
    const backup = http.expectOne(backupUrl);
    const filesets = http.expectOne(`${backupUrl}/filesets`);
    backup.flush({ Backup: { ID: '42', Settings: [], IsTemporary: false, DBPathExists: false } });
    filesets.flush([{ ...fileset, IsFullBackup: 1 }]);
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(state.versionOptions()).toEqual([fileset]);
    expect(state.versionOptionsLoading()).toBe(false);
    http.expectNone(filesetsUrl);
  });
});
