import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { DuplicatiServer } from '../core/openapi';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { ServerStateService } from '../core/services/server-state.service';
import { BackupsState } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';
import HomeComponent from './home.component';

describe('home search Signal Form', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(names: Array<string | null> = ['Alpha', 'Beta', 'Gamma', 'Delta']) {
    const backups = signal(names.map((Name) => ({ Backup: { Name } })));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BackupsState,
          useValue: { backups, orderBy: signal('Name'), setOrderBy: vi.fn(), getBackups: vi.fn() },
        },
        { provide: StatusBarState, useValue: {} },
        { provide: ServerStateService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: SysinfoState, useValue: {} },
        { provide: RemoteControlState, useValue: {} },
        { provide: ShipDialogService, useValue: {} },
        { provide: LOCALSTORAGE, useValue: { getItemParsed: () => null, setItemParsed: vi.fn() } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new HomeComponent());
    return { component, backups };
  }
  it('trims and ignores case while matching backup names', async () => {
    const { component } = await setup();
    component.searchForm.query().value.set('  aLpHa  ');
    expect(component.filteredBackups().map((x) => x.Backup.Name)).toEqual(['Alpha']);
  });
  it('returns every backup when the query is cleared or only whitespace', async () => {
    const { component, backups } = await setup();
    component.searchForm.query().value.set('missing');
    expect(component.filteredBackups()).toEqual([]);
    component.searchTerm.set('');
    expect(component.searchForm.query().value()).toBe('');
    expect(component.filteredBackups()).toEqual(backups());
    component.searchForm.query().value.set('   ');
    expect(component.filteredBackups()).toEqual(backups());
  });
  it('ignores filtering while the search field is hidden at three or fewer backups', async () => {
    const { component, backups } = await setup(['Alpha', 'Beta', 'Gamma']);
    component.searchForm.query().value.set('Alpha');
    expect(component.showSearch()).toBe(false);
    expect(component.filteredBackups()).toEqual(backups());
    backups.update((items) => [...items, { Backup: { Name: 'Delta' } }]);
    expect(component.showSearch()).toBe(true);
    expect(component.filteredBackups().map((x) => x.Backup.Name)).toEqual(['Alpha']);
    backups.update((items) => items.slice(0, 3));
    expect(component.filteredBackups()).toEqual(backups());
  });
  it('handles a missing backup name without throwing or matching it', async () => {
    const { component } = await setup(['Alpha', 'Beta', null, 'Delta']);
    component.searchForm.query().value.set('alpha');
    expect(component.filteredBackups().map((x) => x.Backup.Name)).toEqual(['Alpha']);
  });
});

describe('home start all backups', () => {
  afterEach(() => TestBed.resetTestingModule());

  function backup(ID: string, Enabled?: boolean) {
    return { Backup: { ID, Name: `Backup ${ID}`, ...(Enabled === undefined ? {} : { Enabled }) } };
  }

  function setup(list: ReturnType<typeof backup>[], running: string | null = null, queued: string[] = []) {
    const dupServer = { postApiV1BackupByIdStart: vi.fn(() => of({})), getApiV1Backups: vi.fn() };
    const dialog = { open: vi.fn() };
    const statusBar = { runningBackupId: signal(running), resumeDialogCheck: vi.fn((cb: () => void) => cb()) };
    const serverState = {
      isConnectionMethodSet: signal(true),
      getConnectionMethod: signal('websocket'),
      backupListState: signal(list),
      subscribe: vi.fn(),
      serverState: signal({ SchedulerQueueIds: queued.map((Item2, i) => ({ Item1: i + 10, Item2 })) }),
    };
    TestBed.configureTestingModule({
      providers: [
        BackupsState,
        { provide: StatusBarState, useValue: statusBar },
        { provide: ServerStateService, useValue: serverState },
        { provide: DuplicatiServer, useValue: dupServer },
        {
          provide: SysinfoState,
          useValue: { hasBackupEnableDisable: signal(true), hasBackupListSubscribeOption: signal(true) },
        },
        { provide: RemoteControlState, useValue: {} },
        { provide: ShipDialogService, useValue: dialog },
        { provide: LOCALSTORAGE, useValue: { getItemParsed: () => null, setItemParsed: vi.fn(), removeItem: vi.fn() } },
      ],
    });
    TestBed.inject(BackupsState);
    TestBed.tick();
    const component = TestBed.runInInjectionContext(() => new HomeComponent());
    return { component, dupServer, dialog, statusBar };
  }

  it('asks first and then sends a start request for each enabled backup that is not running or queued', () => {
    const { component, dupServer, dialog, statusBar } = setup(
      [backup('1'), backup('2', false), backup('3', true), backup('4'), backup('5')],
      '4',
      ['5']
    );

    component.startAllBackups();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(dupServer.postApiV1BackupByIdStart).not.toHaveBeenCalled();

    dialog.open.mock.calls[0][1].closed(true);
    expect(statusBar.resumeDialogCheck).toHaveBeenCalledOnce();
    expect(dupServer.postApiV1BackupByIdStart.mock.calls).toEqual([[{ path: { id: '1' } }], [{ path: { id: '3' } }]]);
  });

  it('starts nothing when the confirmation is cancelled', () => {
    const { component, dupServer, dialog } = setup([backup('1'), backup('2')]);

    component.startAllBackups();
    dialog.open.mock.calls[0][1].closed(false);

    expect(dupServer.postApiV1BackupByIdStart).not.toHaveBeenCalled();
  });

  it('does not open the dialog when every backup is skipped', () => {
    const { component, dialog } = setup([backup('1', false), backup('2')], '2');

    expect(component.startAllBackupIds()).toEqual([]);
    component.startAllBackups();
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
