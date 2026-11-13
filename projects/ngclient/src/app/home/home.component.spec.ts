import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
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
