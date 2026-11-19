import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { ServerStateService } from '../services/server-state.service';
import { BackupRes, BackupsState } from './backups.state';
import { SysinfoState } from './sysinfo.state';

describe('BackupsState skip next run', () => {
  afterEach(() => TestBed.resetTestingModule());

  // Uses the WebSocket transport so a refresh shows up as a backup list subscription
  function setup() {
    const skip = new Subject<unknown>();
    const dupServer = {
      postApiV1BackupByIdSkipNextRun: vi.fn(() => skip),
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
    return { state, dupServer, serverState, skip };
  }

  it('asks the server to skip the next run and refreshes the list once it is accepted', () => {
    const { state, dupServer, serverState, skip } = setup();
    const subscriptionsBefore = serverState.subscribe.mock.calls.length;

    state.skipNextRun('7').subscribe();
    expect(dupServer.postApiV1BackupByIdSkipNextRun).toHaveBeenCalledExactlyOnceWith({ path: { id: '7' } });
    expect(serverState.subscribe.mock.calls.length).toBe(subscriptionsBefore);

    skip.next({ Status: 'OK', NextScheduledRun: '2026-11-16T04:00:00Z' });
    expect(serverState.subscribe.mock.calls.length).toBe(subscriptionsBefore + 1);
    expect(serverState.subscribe).toHaveBeenLastCalledWith('backuplist', 'id');
  });

  it('does not refresh when the server rejects the request', () => {
    const { state, serverState, skip } = setup();
    const subscriptionsBefore = serverState.subscribe.mock.calls.length;
    const error = vi.fn();

    state.skipNextRun('7').subscribe({ error });
    skip.error(new Error('The backup has no schedule'));

    expect(error).toHaveBeenCalledOnce();
    expect(serverState.subscribe.mock.calls.length).toBe(subscriptionsBefore);
  });
});
