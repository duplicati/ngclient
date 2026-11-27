import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, GetBackupResultDto } from '../core/openapi';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { RestoreFlowState } from './restore-flow.state';

const EXTENSION = 'v1:backup:copytotemp-destination';
const targets = [
  { UrlKey: 'a', TargetUrl: 'file:///mnt/a' },
  { UrlKey: null, TargetUrl: 'file:///mnt/unsaved' },
  { UrlKey: 'b', TargetUrl: 'file:///mnt/b' },
];

describe('RestoreFlowState restore from a secondary destination', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(extensions: string[], backup: Record<string, unknown> = {}) {
    const restore = vi.fn().mockResolvedValue({ ID: 9 });
    const copyToTemp = vi.fn().mockResolvedValue({ ID: 'temp-1' });
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        RestoreFlowState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
        { provide: ShipDialogService, useValue: { open } },
        {
          provide: DuplicatiServer,
          useValue: { postApiV1BackupByIdRestore: restore, postApiV1BackupByIdCopytotemp: copyToTemp },
        },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ APIExtensions: extensions }),
            hasRestoreOptions: signal(true),
            hasRegisterRestoredItems: signal(false),
          },
        },
        { provide: ServerSettingsService, useValue: { serverSettings: signal({}) } },
      ],
    });
    const state = TestBed.inject(RestoreFlowState);
    state.backupId.set('42');
    state.backup.set({
      Backup: { ID: '42', OperationType: 'Backup', IsTemporary: false, AdditionalTargetURLs: targets, ...backup },
    } as unknown as GetBackupResultDto);
    return { state, restore, copyToTemp, open };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('offers the saved secondary destinations of a backup', () => {
    const { state } = setup([EXTENSION]);
    expect(state.secondaryDestinations().map((x) => x.UrlKey)).toEqual(['a', 'b']);
  });

  it.each([
    ['the server reports no secondary destinations', [EXTENSION], { AdditionalTargetURLs: undefined }],
    ['the job is a Sync job', [EXTENSION], { OperationType: 'Sync' }],
    ['the backup is temporary', [EXTENSION], { IsTemporary: true }],
    ['the backup has no secondary destinations', [EXTENSION], { AdditionalTargetURLs: [] }],
  ])('offers none when %s', (_name, extensions, backup) => {
    const { state } = setup(extensions, backup);
    expect(state.secondaryDestinations()).toEqual([]);
  });

  it('restores straight from the backup when the primary destination is chosen', async () => {
    const { state, restore, copyToTemp } = setup([EXTENSION]);
    state.submit();
    await settle();
    expect(copyToTemp).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: { id: '42' } }));
  });

  it('restores through a temporary copy that reads the chosen secondary destination', async () => {
    const { state, restore, copyToTemp } = setup([EXTENSION]);
    state.optionsForm.patchValue({ restoreSource: 'b' });
    state.submit();
    await settle();
    expect(copyToTemp).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' }, query: { destination: 'b' } });
    expect(restore).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: { id: 'temp-1' } }));
  });

  it('ignores a destination the backup does not have', async () => {
    const { state, restore, copyToTemp } = setup([EXTENSION]);
    state.optionsForm.patchValue({ restoreSource: 'gone' });
    state.submit();
    await settle();
    expect(copyToTemp).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: { id: '42' } }));
  });

  it('lets the restore be submitted again when the copy fails', async () => {
    const { state, restore, copyToTemp, open } = setup([EXTENSION]);
    copyToTemp.mockRejectedValue(new Error('unreachable'));
    state.optionsForm.patchValue({ restoreSource: 'a' });
    state.submit();
    await settle();
    expect(restore).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(state.isSubmitting()).toBe(false);
  });
});
