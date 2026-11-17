import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { ServerStateService } from '../services/server-state.service';
import { BackupRes, BackupsState } from './backups.state';
import { SysinfoState } from './sysinfo.state';

describe('BackupsState start several backups', () => {
  afterEach(() => TestBed.resetTestingModule());

  // Uses the WebSocket transport so the final refresh is a re-subscribe instead of an HTTP request
  function setup() {
    const responses = new Map<string, Subject<unknown>>();
    const dupServer = {
      postApiV1BackupByIdStart: vi.fn(({ path }: { path: { id: string } }) => {
        const response = new Subject<unknown>();
        responses.set(path.id, response);
        return response;
      }),
      getApiV1Backups: vi.fn(),
    };
    const serverState = {
      isConnectionMethodSet: signal(true),
      getConnectionMethod: signal('websocket'),
      backupListState: signal<BackupRes | null>([]),
      subscribe: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        BackupsState,
        { provide: DuplicatiServer, useValue: dupServer },
        { provide: SysinfoState, useValue: { hasBackupListSubscribeOption: signal(true) } },
        { provide: ServerStateService, useValue: serverState },
        {
          provide: LOCALSTORAGE,
          useValue: { getItemParsed: vi.fn(() => null), setItemParsed: vi.fn(), removeItem: vi.fn() },
        },
      ],
    });
    const state = TestBed.inject(BackupsState);
    TestBed.tick();
    serverState.subscribe.mockClear();
    return { state, dupServer, serverState, responses };
  }

  it('sends one start request at a time in the given order and refreshes the list once', () => {
    const { state, dupServer, serverState, responses } = setup();

    state.startBackups(['3', '1', '2']);
    expect(state.startingAllBackups()).toBe(true);
    expect(dupServer.postApiV1BackupByIdStart.mock.calls).toEqual([[{ path: { id: '3' } }]]);
    expect(state.startingBackup()).toBe('3');

    responses.get('3')!.next({});
    expect(dupServer.postApiV1BackupByIdStart.mock.calls.map((x) => x[0].path.id)).toEqual(['3', '1']);

    responses.get('1')!.next({});
    responses.get('2')!.next({});
    expect(dupServer.postApiV1BackupByIdStart.mock.calls.map((x) => x[0].path.id)).toEqual(['3', '1', '2']);
    expect(state.startingAllBackups()).toBe(false);
    expect(state.startingBackup()).toBeNull();
    expect(serverState.subscribe).toHaveBeenCalledExactlyOnceWith('backuplist', 'id');
  });

  it('keeps starting the remaining backups when one start request fails', () => {
    const { state, dupServer, responses } = setup();

    state.startBackups(['1', '2']);
    responses.get('1')!.error(new Error('Backup not found'));
    responses.get('2')!.next({});

    expect(dupServer.postApiV1BackupByIdStart.mock.calls.map((x) => x[0].path.id)).toEqual(['1', '2']);
    expect(state.startingAllBackups()).toBe(false);
  });

  it('ignores a second request while the first one is still starting backups', () => {
    const { state, dupServer } = setup();

    state.startBackups(['1']);
    state.startBackups(['2']);

    expect(dupServer.postApiV1BackupByIdStart).toHaveBeenCalledExactlyOnceWith({ path: { id: '1' } });
  });
});
