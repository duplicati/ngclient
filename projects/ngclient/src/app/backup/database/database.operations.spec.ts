import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import DatabaseComponent from './database.component';

describe('DatabaseComponent destructive operation sequencing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  function setup() {
    const deletion = new Subject<unknown>();
    const repair = new Subject<unknown>();
    const save = new Subject<unknown>();
    const deletedb = vi.fn(() => deletion);
    const repairdb = vi.fn(() => repair);
    const updatedb = vi.fn(() => save);
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [DatabaseComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ id: '42' }) } },
        { provide: BackupsState, useValue: { backups: signal([]) } },
        {
          provide: DuplicatiServer,
          useValue: {
            postApiV1BackupByIdDeletedb: deletedb,
            postApiV1BackupByIdRepair: repairdb,
            postApiV1BackupByIdUpdatedb: updatedb,
            postApiV1FilesystemValidate: vi.fn(() => of({})),
          },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: ServerSettingsService, useValue: { reducedReporting: signal({ active: false }) } },
      ],
    }).overrideComponent(DatabaseComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(DatabaseComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.backupFilePath.set('/data/backup.sqlite');
    component.lastValidatedPath.set('/data/backup.sqlite');
    return { component, deletion, repair, save, deletedb, repairdb, updatedb, open };
  }
  it('does not delete or call the continuation when confirmation is cancelled', () => {
    const { component, open, deletedb } = setup();
    const callback = vi.fn();
    component.deleteDatabase(callback);
    expect(deletedb).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(deletedb).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(component.isDeleting()).toBe(false);
  });
  it('waits for the confirmed delete response before clearing validation and continuing', () => {
    const { component, open, deletedb, deletion } = setup();
    const callback = vi.fn();
    component.deleteDatabase(callback);
    open.mock.calls[0][1].closed(true);
    expect(deletedb).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' } });
    expect(component.isDeleting()).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    deletion.next({});
    deletion.complete();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(component.lastValidatedPath()).toBe('');
    expect(component.isDeleting()).toBe(false);
  });
  it('recreates an existing database only after confirmation and deletion complete', () => {
    const { component, open, deletion, repair, deletedb, repairdb } = setup();
    component.restoreDatabase();
    expect(deletedb).not.toHaveBeenCalled();
    expect(repairdb).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(true);
    expect(repairdb).not.toHaveBeenCalled();
    deletion.next({});
    deletion.complete();
    expect(repairdb).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' }, body: {} });
    expect(component.isRestoring()).toBe(true);
    repair.next({});
    repair.complete();
    expect(component.isRestoring()).toBe(false);
  });
  it('recreates a missing database without deleting another path', () => {
    const { component, open, deletedb, repairdb, repair } = setup();
    component.lastValidatedPath.set('');
    component.restoreDatabase();
    expect(open).not.toHaveBeenCalled();
    expect(deletedb).not.toHaveBeenCalled();
    expect(repairdb).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' }, body: {} });
    repair.next({});
    repair.complete();
    expect(component.isRestoring()).toBe(false);
  });
  it('waits for an approved path reassignment before starting repair', () => {
    const { component, open, updatedb, repairdb, save, repair } = setup();
    component.saveAndRepairDatabasePath();
    expect(updatedb).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(repairdb).not.toHaveBeenCalled();
    component.saveAndRepairDatabasePath();
    open.mock.calls[1][1].closed(true);
    expect(updatedb).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' }, body: { path: '/data/backup.sqlite' } });
    expect(repairdb).not.toHaveBeenCalled();
    expect(component.isSavingDbPath()).toBe(true);
    save.next({});
    save.complete();
    expect(component.pathHasChanged()).toBe(false);
    expect(component.isSavingDbPath()).toBe(false);
    expect(repairdb).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' } });
    expect(component.isSavingAndRepairing()).toBe(true);
    repair.next({});
    repair.complete();
    expect(component.isSavingAndRepairing()).toBe(false);
  });
});
