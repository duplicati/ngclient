import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupDto, DuplicatiServer, ScheduleDto } from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { BackupState } from './backup.state';

describe('BackupState saved DTO contracts', () => {
  let state: BackupState;
  const create = vi.fn(() => of({}));
  const update = vi.fn(() => of({}));
  const settings = signal<Record<string, string>>({
    '--retry-count': '99',
    '--global-option': 'enabled',
    unrelated: 'ignore',
  });
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
    create.mockClear();
    update.mockClear();
    TestBed.configureTestingModule({
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: { postApiV1Backups: create, putApiV1BackupById: update } },
        { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
        { provide: ServerSettingsService, useValue: { serverSettings: settings } },
        { provide: TimespanLiteralsService, useValue: { fromString: () => ({ value: 2, unit: 'W' }) } },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]), reload: vi.fn() } },
      ],
    });
    state = TestBed.inject(BackupState);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllEnvs();
  });

  const loaded = {
    Name: 'Documents',
    Description: 'Saved description',
    OperationType: 'Backup',
    TargetURL: 'sftp://example.test/archive?auth-username=alice',
    ConnectionStringID: 42,
    AdditionalTargetURLs: [{ TargetUrl: 'file:///secondary', ConnectionStringID: 84, UrlKey: 'secondary' }],
    Sources: ['/documents/', '@remote|sftp://example.test/source'],
    Filters: [
      { Include: false, Expression: '*.tmp', Order: 0 },
      { Include: true, Expression: 'keep.txt', Order: 1 },
    ],
    Settings: [
      { Name: 'encryption-module', Value: 'aes' },
      { Name: 'passphrase', Value: 'test-secret' },
      { Name: '--dblock-size', Value: '50MB' },
      { Name: 'compression-module', Value: 'zip' },
      { Name: 'keep-versions', Value: '5' },
      { Name: '--retry-count', Value: '7' },
      { Name: '--custom-option', Value: 'unknown=value' },
      { Name: '--skip-files-larger-than', Value: '12MB' },
    ],
    Metadata: { 'draft-note': 'preserve' },
  } as unknown as BackupDto;
  function load(isDraft = false) {
    state.isDraft.set(isDraft);
    state.mapGeneralToForm(loaded);
    state.mapSourceDataToForm(loaded);
    state.mapDestinationToForm(loaded);
    state.mapOptionsToForms(loaded);
    state.mapScheduleToForm({ Time: '2026-10-30T13:00:00Z', Repeat: '2W', AllowedDays: ['mon', 'fri'] } as ScheduleDto);
    state.storeMetadata(loaded, isDraft);
  }
  const expectedBackup = {
    Name: 'Documents',
    Description: 'Saved description',
    OperationType: 'Backup',
    TargetURL: loaded.TargetURL,
    ConnectionStringID: 42,
    AdditionalTargetURLs: [{ TargetUrl: 'file:///secondary', ConnectionStringID: 84, UrlKey: 'secondary' }],
    Sources: loaded.Sources,
    Filters: [
      { Order: 0, Include: false, Expression: '*.tmp' },
      { Order: 1, Include: true, Expression: 'keep.txt' },
    ],
    Settings: [
      { Name: 'encryption-module', Value: 'aes' },
      { Name: 'passphrase', Value: 'test-secret' },
      { Name: 'dblock-size', Value: '50MB' },
      { Name: 'compression-module', Value: 'zip' },
      { Name: 'keep-versions', Value: '5' },
      { Name: '--retry-count', Value: '7' },
      { Name: '--custom-option', Value: 'unknown=value' },
      { Name: '--skip-files-larger-than', Value: '12MB' },
    ],
  };
  it.each(['new', 'edit', 'draft'] as const)('preserves the complete %s submission after loading the forms', (mode) => {
    state.backupId.set(mode === 'new' ? 'new' : 'string');
    load(mode === 'draft');
    state.submit(true);
    const request = mode === 'edit' ? update : create;
    expect(request).toHaveBeenCalledExactlyOnceWith({
      ...(mode === 'edit' ? { path: { id: 'string' } } : {}),
      body: {
        Backup: { ...expectedBackup, ...(mode === 'draft' ? { Metadata: loaded.Metadata } : {}) },
        Schedule: { Time: '2026-10-30T13:00:00.000Z', Repeat: '2W', AllowedDays: ['Monday', 'Friday'] },
      },
    });
    expect(mode === 'edit' ? create : update).not.toHaveBeenCalled();
    expect(state.isSubmitting()).toBe(false);
  });

  it('saves a Sync job without encryption or retention and with scheduling disabled', () => {
    state.backupId.set('new');
    load();
    state.generalForm.controls.operationType.setValue('Sync');
    state.mapScheduleToForm(null);
    state.submit(true);
    expect(create).toHaveBeenCalledExactlyOnceWith({
      body: {
        Backup: {
          ...expectedBackup,
          OperationType: 'Sync',
          Settings: [
            { Name: '--no-encryption', Value: 'True' },
            ...expectedBackup.Settings.filter(
              (x) => !['encryption-module', 'passphrase', 'keep-versions'].includes(x.Name)
            ),
          ],
        },
        Schedule: null,
      },
    });
  });

  it('merges only absent global options into a new backup and preserves local overrides', () => {
    state.backupId.set('new');
    state.mapGeneralToForm(loaded);
    state.mapOptionsToForms(loaded, true);
    expect(state.mapFormsToSettings()).toEqual([
      { Name: 'encryption-module', Value: 'aes' },
      { Name: 'passphrase', Value: 'test-secret' },
      { Name: 'dblock-size', Value: '50MB' },
      { Name: 'compression-module', Value: 'zip' },
      { Name: 'keep-versions', Value: '5' },
      { Name: '--retry-count', Value: '7' },
      { Name: '--custom-option', Value: 'unknown=value' },
      { Name: '--global-option', Value: 'enabled' },
    ]);
  });

  it('keeps encryption unchanged when loading partial general metadata', () => {
    state.generalForm.patchValue({ encryption: 'aes' });
    state.mapGeneralToForm({ Name: 'Renamed' } as BackupDto);
    expect(state.generalForm.value).toEqual({
      name: 'Renamed',
      description: '',
      encryption: 'aes',
      password: '',
      repeatPassword: '',
      operationType: 'Backup',
    });
  });
});
