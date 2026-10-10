import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, GetApiV1ProgressstateResponse, GetTaskStateDto } from '../../openapi';
import { BytesPipe } from '../../pipes/byte.pipe';
import { ServerStateService } from '../../services/server-state.service';
import { BackupsState } from '../../states/backups.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { StatusBarState } from './status-bar.state';

describe('StatusBarState estimated totals', () => {
  afterEach(() => TestBed.resetTestingModule());

  const setup = (overrides: GetApiV1ProgressstateResponse = {}) => {
    const progressState = signal<GetApiV1ProgressstateResponse>({
      TaskID: 42,
      Phase: 'Backup_ProcessingFiles',
      TotalFileCount: 10,
      TotalFileSize: 1000,
      ProcessedFileCount: 5,
      ProcessedFileSize: 200,
      CurrentFilecomplete: true,
      CurrentFileoffset: 0,
      StillCounting: false,
      BackendSpeed: -1,
      ...overrides,
    });
    TestBed.configureTestingModule({
      providers: [
        StatusBarState,
        { provide: BytesPipe, useValue: { transform: (bytes: number) => `${bytes} bytes` } },
        { provide: DuplicatiServer, useValue: {} },
        { provide: BackupsState, useValue: { getBackups: vi.fn(), getBackupById: vi.fn(() => null) } },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: SysinfoState, useValue: { hasProgressSubscribeOption: signal(true) } },
        {
          provide: ServerStateService,
          useValue: {
            serverState: signal(null),
            progressState,
            taskQueueState: signal<GetTaskStateDto[]>([{ ID: 42, Status: 'Running' }]),
            connectionStatus: signal('connected'),
            getConnectionMethod: () => 'websocket',
            subscribe: vi.fn(),
          },
        },
      ],
    });
    const state = TestBed.inject(StatusBarState);
    TestBed.tick();
    return { state, progressState };
  };

  it.each([
    { label: 'zero divided by zero', total: 0, processed: 0 },
    { label: 'positive bytes with a zero total', total: 0, processed: 200 },
    { label: 'unknown negative total', total: -1, processed: 200 },
  ])('keeps progress at zero for $label', ({ total, processed }) => {
    const { state } = setup({ TotalFileSize: total, ProcessedFileSize: processed, ProcessedFileCount: 1 });
    expect(state.statusData()).not.toBeNull();
    expect(Number.isFinite(state.statusData()!.progress)).toBe(true);
    expect(state.statusData()!.progress).toBe(0);
  });

  it('retains the 0.9 cap when processing exceeds a positive total', () => {
    const { state } = setup({ TotalFileCount: 1, ProcessedFileCount: 2, TotalFileSize: 100, ProcessedFileSize: 200 });
    expect(state.statusData()!.progress).toBe(0.9);
    expect(state.statusData()!.statusText).toContain('Completing upload');
  });

  it.each(['Backup_ProcessingFiles', 'Restore_DownloadingRemoteFiles', 'Sync_ProcessingFiles'])(
    'does not display negative remaining bytes during %s',
    (phase) => {
      const { state } = setup({ Phase: phase, TotalFileSize: 100, ProcessedFileSize: 120 });
      expect(state.statusData()!.statusText).toContain('5 files (0 bytes) to go');
    }
  );

  it('does not display negative remaining files when processing exceeds the estimate', () => {
    const { state } = setup({ Phase: 'Restore_DownloadingRemoteFiles', TotalFileCount: 2, ProcessedFileCount: 5 });
    expect(state.statusData()!.statusText).toContain('0 files (800 bytes) to go');
  });

  it('clamps remaining bytes after including the current incomplete file offset', () => {
    const { state } = setup({
      TotalFileSize: 100,
      ProcessedFileSize: 80,
      CurrentFilecomplete: false,
      CurrentFileoffset: 30,
    });
    expect(state.statusData()!.statusText).toContain('5 files (0 bytes) to go');
    expect(state.statusData()!.progress).toBe(0.9);
  });

  it('does not display a negative unknown byte total as remaining work', () => {
    const { state } = setup({ TotalFileSize: -1 });
    expect(state.statusData()!.statusText).toContain('5 files (0 bytes) to go');
  });

  it('clamps remaining files and bytes for secondary destination synchronization', () => {
    const { state } = setup({
      Phase: 'Backup_RemoteSynchronization',
      TotalFileCount: 2,
      ProcessedFileCount: 5,
      TotalFileSize: 100,
      ProcessedFileSize: 200,
      OverallProgress: 0.4,
      RemoteSyncDestinationCount: 2,
      RemoteSyncDestinationIndex: 1,
    });
    expect(state.statusData()!.statusText).toContain(
      'Synchronizing secondary destination (1/2): 0 files (0 bytes) to go'
    );
    expect(state.statusData()!.progress).toBe(0.4);
  });

  it('retains normal remaining work and the incomplete-file progress contribution', () => {
    const { state } = setup({ CurrentFilecomplete: false, CurrentFileoffset: 100 });
    expect(state.statusData()!.progress).toBe(0.3);
    expect(state.statusData()!.statusText).toContain('5 files (700 bytes) to go');
  });

  it('does not include the offset of a completed file', () => {
    const { state } = setup({ CurrentFileoffset: 100 });
    expect(state.statusData()!.progress).toBe(0.2);
    expect(state.statusData()!.statusText).toContain('5 files (800 bytes) to go');
  });

  it('retains zero progress while counting and base text when no files are known', () => {
    const { state, progressState } = setup({ StillCounting: true });
    expect(state.statusData()!.progress).toBe(0);
    progressState.update((value) => ({
      ...value,
      StillCounting: false,
      TotalFileCount: 0,
      TotalFileSize: 0,
      ProcessedFileCount: 0,
      ProcessedFileSize: 0,
    }));
    TestBed.tick();
    expect(state.statusData()!.progress).toBe(0);
    expect(state.statusData()!.statusText).not.toContain('to go');
  });
});
