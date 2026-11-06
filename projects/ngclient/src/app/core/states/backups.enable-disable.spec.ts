import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { ServerStateService } from '../services/server-state.service';
import { BackupRes, BackupsState } from './backups.state';
import { SysinfoState } from './sysinfo.state';

describe('BackupsState enable and disable', () => {
  afterEach(() => TestBed.resetTestingModule());

  function backup(id: string, enabled?: boolean): BackupRes[0] {
    return {
      Schedule: {
        ID: Number(id),
        Tags: [`ID=${id}`],
        Time: '2026-10-22T04:00:00Z',
        Repeat: '1D',
        LastRun: '2026-10-21T04:00:00Z',
        Rule: '',
        AllowedDays: [],
      },
      Backup: {
        ID: id,
        Name: `Backup ${id}`,
        ExternalID: null,
        Description: '',
        Tags: [],
        TargetURL: 'file:///backup',
        DBPath: `/data/${id}.sqlite`,
        DBPathExists: true,
        Sources: ['/source'],
        Settings: [],
        Filters: [],
        Metadata: {},
        IsTemporary: false,
        IsUnencryptedOrPassphraseStored: true,
        AdditionalTargetURLs: [],
        ...(enabled === undefined ? {} : { Enabled: enabled }),
      },
    };
  }

  // Uses the WebSocket transport so the list is seeded from a push and refreshes do not hit HTTP
  function setup(list: BackupRes) {
    const enable = new Subject<unknown>();
    const disable = new Subject<unknown>();
    const dupServer = {
      postApiV1BackupByIdEnable: vi.fn(() => enable),
      postApiV1BackupByIdDisable: vi.fn(() => disable),
      getApiV1Backups: vi.fn(),
    };
    const serverState = {
      isConnectionMethodSet: signal(true),
      getConnectionMethod: signal('websocket'),
      backupListState: signal<BackupRes | null>(list),
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
    return { state, dupServer, serverState, enable, disable };
  }

  it('disables a backup and updates only that backup once the server accepts it', () => {
    const { state, dupServer, serverState, disable } = setup([backup('1'), backup('2')]);

    state.setBackupEnabled('1', false).subscribe();
    expect(dupServer.postApiV1BackupByIdDisable).toHaveBeenCalledExactlyOnceWith({ path: { id: '1' } });
    expect(dupServer.postApiV1BackupByIdEnable).not.toHaveBeenCalled();
    expect(state.getBackupById('1')?.Backup.Enabled).toBeUndefined();

    disable.next(undefined);
    expect(state.getBackupById('1')?.Backup.Enabled).toBe(false);
    expect(state.getBackupById('2')?.Backup.Enabled).toBeUndefined();
    expect(serverState.subscribe).toHaveBeenCalledWith('backuplist', 'id');
    expect(dupServer.getApiV1Backups).not.toHaveBeenCalled();
  });

  it('enables a disabled backup', () => {
    const { state, dupServer, enable } = setup([backup('1', false)]);

    state.setBackupEnabled('1', true).subscribe();
    expect(dupServer.postApiV1BackupByIdEnable).toHaveBeenCalledExactlyOnceWith({ path: { id: '1' } });

    enable.next(undefined);
    expect(state.getBackupById('1')?.Backup.Enabled).toBe(true);
  });

  it('keeps the list unchanged when the server rejects the change', () => {
    const { state, disable } = setup([backup('1', true)]);
    const error = vi.fn();

    state.setBackupEnabled('1', false).subscribe({ error });
    disable.error(new Error('Backup not found'));

    expect(error).toHaveBeenCalledOnce();
    expect(state.getBackupById('1')?.Backup.Enabled).toBe(true);
  });
});
