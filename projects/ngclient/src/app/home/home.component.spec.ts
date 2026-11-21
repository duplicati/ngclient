import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject, throwError } from 'rxjs';
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
    const setOrderBy = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BackupsState,
          useValue: { backups, orderBy: signal('name'), setOrderBy, getBackups: vi.fn() },
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
    return { component, backups, setOrderBy };
  }
  it('trims and ignores case while matching backup names', async () => {
    const { component } = await setup();
    component.searchForm.query().value.set('  aLpHa  ');
    expect(component.filteredBackups().map((x) => x.Backup.Name)).toEqual(['Alpha']);
  });
  it('initializes the sort field from backup state and persists a change', () => {
    const { component, setOrderBy } = setup();
    expect(component.sortField().value()).toBe('name');
    TestBed.tick();
    component.sortByColumn.set('-name');
    TestBed.tick();
    expect(component.sortField().value()).toBe('-name');
    expect(setOrderBy).toHaveBeenLastCalledWith('-name');
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

  function setup(
    list: ReturnType<typeof backup>[],
    running: string | null = null,
    queued: string[] = [],
    canSetAfterAction = true,
    supportedActions: string[] | 'fails' = ['Shutdown', 'Reboot']
  ) {
    const dupServer = {
      postApiV1BackupByIdStart: vi.fn(() => of({})),
      postApiV1ServerstateQueueCompletionAction: vi.fn(() => of({})),
      getApiV1ServerstateQueueCompletionAction: vi.fn(() =>
        supportedActions === 'fails'
          ? throwError(() => new Error('Not available'))
          : of({ PendingAction: 'None', SupportedActions: supportedActions })
      ),
      getApiV1Backups: vi.fn(),
    };
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
          useValue: {
            hasBackupEnableDisable: signal(true),
            hasBackupListSubscribeOption: signal(true),
            hasQueueCompletionAction: signal(canSetAfterAction),
          },
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

  it('lists each enabled backup that is not running or queued and starts only the picked ones', () => {
    const { component, dupServer, dialog, statusBar } = setup(
      [backup('1'), backup('2', false), backup('3', true), backup('4'), backup('5')],
      '4',
      ['5']
    );

    component.startAllBackups();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(dialog.open.mock.calls[0][1].data.backups).toEqual([
      { id: '1', name: 'Backup 1' },
      { id: '3', name: 'Backup 3' },
    ]);
    expect(dupServer.postApiV1BackupByIdStart).not.toHaveBeenCalled();

    expect(dialog.open.mock.calls[0][1].data.afterActions).toEqual(['Shutdown', 'Reboot']);

    dialog.open.mock.calls[0][1].closed({ ids: ['3'], afterAction: 'None' });
    expect(statusBar.resumeDialogCheck).toHaveBeenCalledOnce();
    expect(dupServer.postApiV1BackupByIdStart.mock.calls).toEqual([[{ path: { id: '3' } }]]);
    expect(dupServer.postApiV1ServerstateQueueCompletionAction).not.toHaveBeenCalled();
  });

  it('asks the server to shut down after the picked backups are queued', () => {
    const { component, dupServer, dialog } = setup([backup('1'), backup('2')]);

    component.startAllBackups();
    dialog.open.mock.calls[0][1].closed({ ids: ['1', '2'], afterAction: 'Shutdown' });

    expect(dupServer.postApiV1BackupByIdStart.mock.calls.map((x) => (x as any)[0].path.id)).toEqual(['1', '2']);
    expect(dupServer.postApiV1ServerstateQueueCompletionAction).toHaveBeenCalledExactlyOnceWith({
      body: { Action: 'Shutdown' },
    });
    expect(dupServer.postApiV1ServerstateQueueCompletionAction.mock.invocationCallOrder[0]).toBeGreaterThan(
      dupServer.postApiV1BackupByIdStart.mock.invocationCallOrder[1]
    );
  });

  it('does not offer the shutdown choice on a server without the feature', () => {
    const { component, dupServer, dialog } = setup([backup('1'), backup('2')], null, [], false);

    component.startAllBackups();
    expect(dupServer.getApiV1ServerstateQueueCompletionAction).not.toHaveBeenCalled();
    expect(dialog.open.mock.calls[0][1].data.afterActions).toEqual([]);
  });

  it('offers only the actions the server is allowed to perform', () => {
    const { component, dialog } = setup([backup('1'), backup('2')], null, [], true, ['Reboot']);

    component.startAllBackups();
    expect(dialog.open.mock.calls[0][1].data.afterActions).toEqual(['Reboot']);
  });

  it('still opens the dialog when the server does not tell what it is allowed to do', () => {
    const { component, dialog } = setup([backup('1'), backup('2')], null, [], true, 'fails');

    component.startAllBackups();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(dialog.open.mock.calls[0][1].data.afterActions).toEqual([]);

    // The next attempt asks the server again
    component.startAllBackups();
    expect(dialog.open).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending shutdown', () => {
    const { component, dupServer } = setup([backup('1'), backup('2')]);

    component.cancelQueueCompletionAction();
    expect(dupServer.postApiV1ServerstateQueueCompletionAction).toHaveBeenCalledExactlyOnceWith({
      body: { Action: 'None' },
    });
    expect(component.cancellingQueueCompletionAction()).toBe(false);
  });

  it('starts nothing when the dialog is cancelled or nothing is picked', () => {
    const { component, dupServer, dialog } = setup([backup('1'), backup('2')]);

    component.startAllBackups();
    dialog.open.mock.calls[0][1].closed(null);
    dialog.open.mock.calls[0][1].closed({ ids: [], afterAction: 'Shutdown' });

    expect(dupServer.postApiV1BackupByIdStart).not.toHaveBeenCalled();
    expect(dupServer.postApiV1ServerstateQueueCompletionAction).not.toHaveBeenCalled();
  });

  it('does not open the dialog when every backup is skipped', () => {
    const { component, dialog } = setup([backup('1', false), backup('2')], '2');

    expect(component.startAllBackupIds()).toEqual([]);
    component.startAllBackups();
    expect(dialog.open).not.toHaveBeenCalled();
  });
});

describe('home verify files', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(task: Record<string, unknown> | null) {
    const verify = vi.fn(async () => ({ Status: 'OK', ID: 17 }));
    const completed = new Subject<Record<string, unknown>>();
    const waitForTaskToComplete = vi.fn(() => completed.asObservable());
    const alerts = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BackupsState,
          useValue: { backups: signal([]), orderBy: signal('Name'), setOrderBy: vi.fn(), getBackups: vi.fn() },
        },
        { provide: StatusBarState, useValue: {} },
        { provide: ServerStateService, useValue: { waitForTaskToComplete } },
        { provide: DuplicatiServer, useValue: { postApiV1BackupByIdVerify: verify } },
        { provide: SysinfoState, useValue: {} },
        { provide: RemoteControlState, useValue: {} },
        { provide: ShipDialogService, useValue: {} },
        { provide: ShipAlertService, useValue: alerts },
        { provide: LOCALSTORAGE, useValue: { getItemParsed: () => null, setItemParsed: vi.fn() } },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new HomeComponent());
    const run = async () => {
      component.verifyFiles('3');
      await vi.waitFor(() => expect(waitForTaskToComplete).toHaveBeenCalled());
      if (task) completed.next(task);
    };
    return { run, verify, waitForTaskToComplete, alerts };
  }

  it('reports a successful verification once the queued task completes', async () => {
    const { run, verify, waitForTaskToComplete, alerts } = setup({ ID: 17, Status: 'Completed' });
    await run();
    expect(verify).toHaveBeenCalledWith({ path: { id: '3' } });
    expect(waitForTaskToComplete).toHaveBeenCalledWith(17);
    expect(alerts.success).toHaveBeenCalledTimes(1);
    expect(alerts.error).not.toHaveBeenCalled();
  });

  it('reports a failed verification with the task error', async () => {
    const { run, alerts } = setup({ ID: 17, Status: 'Failed', ErrorMessage: 'Found 2 remote file(s) with problems' });
    await run();
    expect(alerts.success).not.toHaveBeenCalled();
    expect(alerts.error).toHaveBeenCalledTimes(1);
    expect(alerts.error.mock.calls[0][0]).toContain('Found 2 remote file(s) with problems');
  });

  it('reports errors from a task that completed with errors in its results', async () => {
    const { run, alerts } = setup({ ID: 17, Status: 'Completed', ErrorMessage: 'Got 3 error(s)' });
    await run();
    expect(alerts.success).not.toHaveBeenCalled();
    expect(alerts.error.mock.calls[0][0]).toContain('Got 3 error(s)');
  });

  it('does not report anything while the verification is still queued or running', async () => {
    const { run, alerts } = setup(null);
    await run();
    expect(alerts.success).not.toHaveBeenCalled();
    expect(alerts.error).not.toHaveBeenCalled();
  });
});
