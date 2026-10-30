import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { EMPTY, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { BackupState } from './backup.state';

describe('backup save lifecycle', () => {
  let state: BackupState;
  let response: Subject<any>;
  let connection: Subject<any>;
  const create = vi.fn();
  const update = vi.fn();
  const saveConnection = vi.fn();
  const reload = vi.fn();
  const navigate = vi.fn();
  function status() {
    return (state as unknown as { saveState?: () => { status: string } }).saveState?.().status;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    response = new Subject();
    connection = new Subject();
    create.mockReturnValue(response);
    update.mockReturnValue(response);
    saveConnection.mockReturnValue(connection);
    navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate } },
        { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: DuplicatiServer, useValue: { postApiV1Backups: create, putApiV1BackupById: update } },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: { fromString: () => null } },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]), save: saveConnection, reload } },
      ],
    });
    state = TestBed.inject(BackupState);
    state.backupId.set('new');
    state.generalForm.patchValue({ name: 'Original name', encryption: '-' });
    state.sourceDataForm.controls.path.setValue('/source/');
    state.scheduleFields.autoRun.set(false);
    state.setTargetUrl('file:///backup');
    TestBed.tick();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    response.complete();
    connection.complete();
  });

  it('allows only one save while pending, and exits only once', () => {
    state.submit();
    state.submit();
    expect(create).toHaveBeenCalledTimes(1);
    expect(state.isSubmitting()).toBe(true);
    response.next({ ID: '42' });
    response.next({ ID: '42' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(state.isSubmitting()).toBe(false);
    expect(status()).toBe('success');
  });
  it('saves the input snapshot taken before waiting for a connection string', () => {
    state.toggleSaveConnectionString(0);
    state.submit(true);
    state.generalForm.controls.name.setValue('Edited while waiting');
    state.sourceDataForm.controls.path.setValue('/later/');
    connection.next({ Data: { ID: 8 } });
    connection.complete();
    expect(create.mock.calls[0][0].body.Backup).toMatchObject({
      Name: 'Original name',
      Sources: ['/source/'],
      ConnectionStringID: 8,
    });
    response.next({ ID: '42' });
    expect(state.generalForm.controls.name.value).toBe('Edited while waiting');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('keeps inputs on failure and allows an explicit retry', () => {
    state.submit();
    response.error(new Error('save failed'));
    expect(status()).toBe('error');
    expect(state.isSubmitting()).toBe(false);
    expect(state.generalForm.controls.name.value).toBe('Original name');
    expect(navigate).not.toHaveBeenCalled();
    create.mockReturnValue(of({ ID: '42' }));
    state.submit();
    expect(create).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('does not save the backup after connection-string failure and can retry', () => {
    state.toggleSaveConnectionString(0);
    state.submit();
    connection.error(new Error('connection save failed'));
    expect(status()).toBe('error');
    expect(create).not.toHaveBeenCalled();
    expect(state.isSubmitting()).toBe(false);
    saveConnection.mockReturnValue(of({ Data: { ID: 9 } }));
    state.submit(true);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('ignores late responses after leaving the editor', () => {
    state.submit();
    state.exit(false);
    expect(response.observed).toBe(false);
    response.next({ ID: '42' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(state.isSubmitting()).toBe(false);
    expect(status()).toBe('cancelled');
  });
  it('unsubscribes on destruction without navigating or resetting the inputs', () => {
    state.submit();
    TestBed.resetTestingModule();
    expect(response.observed).toBe(false);
    response.next({ ID: '42' });
    expect(navigate).not.toHaveBeenCalled();
    expect(state.generalForm.controls.name.value).toBe('Original name');
    expect(state.isSubmitting()).toBe(false);
    expect(status()).toBe('cancelled');
  });
  it('does not apply an old connection result to a changed URL', () => {
    state.toggleSaveConnectionString(0);
    state.submit();
    state.updateTargetUrl(0, 'file:///other', null, null);
    connection.next({ Data: { ID: 8 } });
    connection.complete();
    expect(create).not.toHaveBeenCalled();
    expect(state.targetUrls()[0]).toMatchObject({ url: 'file:///other', connectionStringId: null });
    expect(reload).not.toHaveBeenCalled();
    expect(status()).toBe('cancelled');
  });
  it('cancels immediately when a destination changes, without waiting for a response', () => {
    state.toggleSaveConnectionString(0);
    state.submit();
    state.setTargetUrl('file:///other');
    TestBed.tick();
    expect(connection.observed).toBe(false);
    expect(state.isSubmitting()).toBe(false);
    expect(status()).toBe('cancelled');
  });
  it('does not navigate when the response belongs to a previous backup', () => {
    state.submit();
    state.backupId.set('other' as 'string');
    response.next({ ID: '42' });
    expect(navigate).not.toHaveBeenCalled();
    expect(state.generalForm.controls.name.value).toBe('Original name');
    expect(status()).toBe('cancelled');
  });
  it('settles an empty response as cancelled rather than successful', () => {
    create.mockReturnValue(EMPTY);
    state.submit();
    expect(state.isSubmitting()).toBe(false);
    expect(status()).toBe('cancelled');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('updates an existing backup without resetting or exiting during autosave', () => {
    state.backupId.set('42' as 'string');
    state.submit(true);
    response.next({});
    expect(update.mock.calls[0][0].path).toEqual({ id: '42' });
    expect(create).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(state.generalForm.controls.name.value).toBe('Original name');
    expect(status()).toBe('success');
  });
  it('reuses the connection ID on retry when only the backup save failed', () => {
    state.toggleSaveConnectionString(0);
    state.submit();
    connection.next({ Data: { ID: 8 } });
    connection.complete();
    response.error(new Error('backup save failed'));
    expect(state.targetUrls()[0].connectionStringId).toBe(8);
    create.mockReturnValue(of({ ID: '42' }));
    state.submit(true);
    expect(saveConnection).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[1][0].body.Backup.ConnectionStringID).toBe(8);
    expect(status()).toBe('success');
  });
  it('keeps draft metadata and additional destinations in the submitted snapshot', () => {
    state.backupId.set('draft' as 'string');
    state.isDraft.set(true);
    state.backupMetadata.set({ Created: 'original' });
    state.updateTargetUrl(0, 'file:///backup', 7, null);
    state.addTargetUrl('webdav://example/second', 8, 'secondary');
    state.submit(true);
    expect(create.mock.calls[0][0].body.Backup).toMatchObject({
      ConnectionStringID: 7,
      Metadata: { Created: 'original' },
      AdditionalTargetURLs: [{ TargetUrl: 'webdav://example/second', ConnectionStringID: 8, UrlKey: 'secondary' }],
    });
    expect(update).not.toHaveBeenCalled();
    response.next({ ID: '42' });
    expect(status()).toBe('success');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('does not report a stale connection error for a changed URL', () => {
    state.toggleSaveConnectionString(0);
    state.submit();
    state.updateTargetUrl(0, 'file:///other', null, null);
    connection.error(new Error('old URL failed'));
    expect(status()).toBe('cancelled');
    expect(create).not.toHaveBeenCalled();
    expect(state.isSubmitting()).toBe(false);
  });
});
