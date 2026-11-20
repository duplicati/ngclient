import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../core/openapi';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { RestoreFlowState } from './restore-flow.state';

describe('RestoreFlowState restore request submission', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup(hasOptions = true) {
    const response = new Subject<{ ID: number }>();
    const restore = vi.fn((_request: unknown) => response);
    const navigate = vi.fn();
    const route = {};
    TestBed.configureTestingModule({
      providers: [
        RestoreFlowState,
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: route },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: DuplicatiServer, useValue: { postApiV1BackupByIdRestore: restore } },
        {
          provide: SysinfoState,
          useValue: { hasRestoreOptions: signal(hasOptions), hasRegisterRestoredItems: signal(false) },
        },
        { provide: ServerSettingsService, useValue: { serverSettings: signal({}) } },
      ],
    });
    const state = TestBed.inject(RestoreFlowState);
    state.backupId.set('42');
    state.selectOption.set('0');
    state.versionOptions.set([
      { Version: 0, Time: '2026-10-21T00:00:00Z' },
      { Version: 7, Time: '2026-10-10T00:00:00Z' },
    ]);
    state.selectFilesForm.patchValue({
      filesToRestore: '/data/file.txt\0/data/folder/\0C:\\folder\\',
      passphrase: 'test-passphrase',
    });
    state.optionsForm.patchValue({
      restoreFromPath: '/restored',
      handleExisting: 'saveTimestamp',
      permissions: false,
      includeMetadata: true,
    });
    return { state, response, restore, navigate, route };
  }
  it('forgets the draft once its restore has started', () => {
    localStorage.setItem('v1:duplicati:restoreDrafts', JSON.stringify(['other', '42']));
    const { state, response } = setup();
    state.submit();
    expect(JSON.parse(localStorage.getItem('v1:duplicati:restoreDrafts')!)).toEqual(['other', '42']);
    response.next({ ID: 123 });
    response.complete();
    expect(JSON.parse(localStorage.getItem('v1:duplicati:restoreDrafts')!)).toEqual(['other']);
    localStorage.removeItem('v1:duplicati:restoreDrafts');
  });
  it('sends the chosen version, exact files, recursive folders and safe restore options', () => {
    const { state, restore, response, navigate, route } = setup();
    state.selectOption.set('7');
    state.submit();
    expect(restore).toHaveBeenCalledExactlyOnceWith({
      path: { id: '42' },
      body: {
        paths: ['/data/file.txt', '/data/folder/*', 'C:\\folder\\*'],
        passphrase: 'test-passphrase',
        time: '2026-10-10T00:00:00Z',
        restore_path: '/restored',
        overwrite: false,
        permissions: false,
        skip_metadata: false,
        source_prefix: null,
        connection_string_id: null,
        options: null,
      },
    });
    expect(state.isSubmitting()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    response.next({ ID: 123 });
    response.complete();
    expect(state.isSubmitting()).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['./123', 'progress'], { relativeTo: route });
  });
  it('maps overwrite and metadata flags independently', () => {
    const { state, restore } = setup();
    state.optionsForm.patchValue({ handleExisting: 'overwrite', includeMetadata: false, permissions: true });
    state.submit();
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          overwrite: true,
          skip_metadata: true,
          permissions: true,
        }),
      })
    );
  });
  it('uses an alternate remote destination and source prefix instead of the local folder', () => {
    const { state, restore } = setup();
    state.setAlternateRestorePath('@office365://target?authid=test', '@source');
    state.submit();
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          restore_path: '@office365://target?authid=test',
          source_prefix: '@source',
        }),
      })
    );
  });
  it('restores the entries a target needs along with the selected ones', () => {
    const { state, restore } = setup();
    state.setAlternateRestorePath('@postgresql://?postgresql-host=db', '@/data');
    state.setAdditionalRestorePaths(['/data/toc', '/data/file.txt']);
    state.submit();
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          paths: ['/data/file.txt', '/data/folder/*', 'C:\\folder\\*', '/data/toc'],
        }),
      })
    );
  });
  it('adds nothing when everything is restored, and forgets what another target needed', () => {
    const { state, restore } = setup();
    state.setAdditionalRestorePaths(['/data/toc']);
    state.selectFilesForm.patchValue({ filesToRestore: '' });
    state.submit();
    expect(restore).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ paths: [''] }) })
    );

    state.selectFilesForm.patchValue({ filesToRestore: '/data/file.txt' });
    state.setAlternateRestorePath(null, null);
    state.submit();
    expect(restore).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ paths: ['/data/file.txt'] }) })
    );
  });
  it('normalizes advanced option names while preserving their values', () => {
    const { state, restore } = setup();
    state.advancedOptions.set([
      { Name: ' --retry-count ', Value: '7' },
      { Name: '--custom-option', Value: null },
      { Name: '---', Value: 'ignored' },
    ]);
    state.submit();
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          options: { 'retry-count': '7', 'custom-option': '' },
        }),
      })
    );
  });
  it('omits advanced options when the server does not support them', () => {
    const { state, restore } = setup(false);
    state.advancedOptions.set([{ Name: '--retry-count', Value: '7' }]);
    state.submit();
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ options: undefined }) })
    );
  });
  it('clears pending state without navigating after a restore failure', () => {
    const { state, response, navigate } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.submit();
    response.error(new Error('restore failed'));
    expect(state.isSubmitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
