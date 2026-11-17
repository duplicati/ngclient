import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
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
