import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupDto, DuplicatiServer } from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { BackupState } from './backup.state';

describe('BackupState retention policy editing', () => {
  let state: BackupState;
  const retentionNames = ['keep-time', 'keep-versions', 'retention-policy'];
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BackupState,
        { provide: Router, useValue: {} },
        { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: {} },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
      ],
    });
    state = TestBed.inject(BackupState);
  });
  afterEach(() => TestBed.resetTestingModule());
  function load(Name: string, Value: string | null) {
    state.mapOptionsToForms({
      Settings: [
        { Name, Value },
        { Name: '--retry-count', Value: '7' },
      ],
    } as BackupDto);
  }
  function savedRetention() {
    return state.mapFormsToSettings().filter((x) => retentionNames.includes(x.Name!));
  }
  it.each([
    ['keep-time', '3M', 'time'],
    ['retention-policy', '1W:1D,4W:1W,12M:1M', 'smart'],
    ['retention-policy', '7D:1D,30D:1W,U:1M', 'custom'],
  ])('round-trips %s=%s without duplicating the managed option', (Name, Value, mode) => {
    load(Name, Value);
    expect(state.optionsFields.backupRetention()).toBe(mode);
    expect(savedRetention()).toEqual([{ Name, Value }]);
    expect(state.settings()).not.toContainEqual(expect.objectContaining({ Name }));
    expect(state.mapFormsToSettings()).toContainEqual({ Name: '--retry-count', Value: '7' });
  });
  it.each(['keep-time', 'keep-versions', 'retention-policy'])('treats an empty %s as keep all', (Name) => {
    load(Name, '');
    expect(state.optionsFields.backupRetention()).toBe('all');
    expect(savedRetention()).toEqual([]);
  });
  it('does not retain an old destructive policy when switched to keep all', () => {
    load('keep-versions', '5');
    state.optionsFields.backupRetention.set('all');
    expect(savedRetention()).toEqual([]);
    expect(state.mapFormsToSettings()).toContainEqual({ Name: '--retry-count', Value: '7' });
  });
  it('emits only the new time policy when switching away from a version limit', () => {
    load('keep-versions', '5');
    state.optionsFields.backupRetention.set('time');
    state.optionsFields.backupRetentionTime.set('14D');
    expect(savedRetention()).toEqual([{ Name: 'keep-time', Value: '14D' }]);
  });
  it('omits backup retention options for synchronization jobs', () => {
    load('retention-policy', '1W:1D,4W:1W,12M:1M');
    state.generalForm.controls.operationType.setValue('Sync');
    expect(savedRetention()).toEqual([]);
  });
});
