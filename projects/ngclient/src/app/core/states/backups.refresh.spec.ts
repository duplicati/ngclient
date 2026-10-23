import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { ServerStateService } from '../services/server-state.service';
import { BackupsState, BackupRes } from './backups.state';
import { SysinfoState } from './sysinfo.state';

describe('BackupsState list refresh transport and caching', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-21T10:00:00Z'), toFake: ['Date'] }));
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  function setup(websocket = false, ready = true) {
    const response = new Subject<BackupRes>();
    const get = vi.fn(() => response);
    const server = {
      isConnectionMethodSet: signal(ready),
      getConnectionMethod: signal(websocket ? 'websocket' : 'longpoll'),
      backupListState: signal<BackupRes | null>(null),
      subscribe: vi.fn(),
    };
    const storage = { getItemParsed: vi.fn(() => null), setItemParsed: vi.fn(), removeItem: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        BackupsState,
        { provide: DuplicatiServer, useValue: { getApiV1Backups: get } },
        { provide: SysinfoState, useValue: { hasBackupListSubscribeOption: signal(websocket) } },
        { provide: ServerStateService, useValue: server },
        { provide: LOCALSTORAGE, useValue: storage },
      ],
    });
    return { state: TestBed.inject(BackupsState), response, get, server, storage };
  }
  const list: BackupRes = [
    {
      Schedule: {
        ID: 1,
        Tags: [],
        Time: '2026-10-22T04:00:00Z',
        Repeat: '1D',
        LastRun: '2026-10-21T04:00:00Z',
        Rule: '',
        AllowedDays: ['mon'],
      },
      Backup: {
        ID: '42',
        Name: 'Documents',
        ExternalID: null,
        Description: '',
        Tags: [],
        TargetURL: 'file:///backup',
        DBPath: '/data/backup.sqlite',
        DBPathExists: true,
        Sources: ['/source'],
        Settings: [],
        Filters: [],
        Metadata: {},
        IsTemporary: false,
        IsUnencryptedOrPassphraseStored: true,
        AdditionalTargetURLs: [],
      },
    },
  ];
  it('defers HTTP requests until a connection method has been selected', () => {
    const { state, get, server, response } = setup(false, false);
    state.getBackups();
    expect(get).not.toHaveBeenCalled();
    expect(state.backupsLoading()).toBe(true);
    server.isConnectionMethodSet.set(true);
    state.getBackups();
    expect(get).toHaveBeenCalledExactlyOnceWith({ query: { orderBy: 'id' } });
    response.next(list);
    expect(state.backupsLoading()).toBe(false);
    expect(state.getBackupById('42')).toEqual(list[0]);
    expect(state.getBackupById('missing')).toBeNull();
  });
  it('reuses a populated list for 15 minutes and refreshes exactly at expiry', () => {
    const { state, response, get } = setup();
    state.getBackups();
    response.next(list);
    vi.setSystemTime(Date.now() + 15 * 60 * 1000 - 1);
    state.getBackups();
    expect(get).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    state.getBackups();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('deduplicates a burst of requests but allows an explicit refresh after 100 ms', () => {
    const { state, response, get } = setup();
    state.getBackups();
    response.next(list);
    vi.setSystemTime(Date.now() + 99);
    state.getBackups(true);
    expect(get).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    state.getBackups(true);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('subscribes over WebSocket, applies notifications and avoids HTTP fetches', () => {
    const { state, server, get } = setup(true);
    state.getBackups();
    expect(server.subscribe).toHaveBeenCalledExactlyOnceWith('backuplist', 'id');
    expect(state.backupsLoading()).toBe(true);
    server.backupListState.set(list);
    TestBed.tick();
    expect(state.backups()).toEqual(list);
    expect(state.backupsLoading()).toBe(false);
    server.subscribe.mockClear();
    state.getBackups(true);
    expect(server.subscribe).toHaveBeenCalledExactlyOnceWith('backuplist', 'id');
    expect(state.backupsLoading()).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
  it('persists a new sort order and resubscribes without a loading flash', () => {
    const { state, server, storage, get } = setup(true);
    server.backupListState.set(list);
    TestBed.tick();
    state.setOrderBy('-name');
    expect(state.orderBy()).toBe('-name');
    expect(storage.setItemParsed).toHaveBeenCalledWith('backupListOrderBy', '-name', false);
    expect(server.subscribe).toHaveBeenCalledExactlyOnceWith('backuplist', '-name');
    expect(state.backupsLoading()).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });
});
