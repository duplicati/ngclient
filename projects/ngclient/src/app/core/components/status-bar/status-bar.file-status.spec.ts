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

describe('StatusBarState file progress', () => {
  afterEach(() => TestBed.resetTestingModule());

  const setup = (overrides: GetApiV1ProgressstateResponse = {}) => {
    const progressState = signal<GetApiV1ProgressstateResponse>({
      TaskID: 42,
      Phase: 'Restore_DownloadingRemoteFiles',
      CurrentFilename: 'empty.txt',
      CurrentFileoffset: 0,
      CurrentFilesize: 0,
      BackendFileProgress: 0,
      BackendFileSize: 0,
      TotalFileCount: 10,
      TotalFileSize: 1000,
      ProcessedFileCount: 1,
      ProcessedFileSize: 100,
      CurrentFilecomplete: true,
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

  const phases = [
    'Backup_ProcessingFiles',
    'Backup_WaitForUpload',
    'Sync_ProcessingFiles',
    'Sync_WaitForUpload',
    'Restore_DownloadingRemoteFiles',
  ];

  describe.each(phases)('%s', (phase) => {
    it.each([
      { offset: 0, size: 0 },
      { offset: 10, size: 0 },
      { offset: 0, size: -1 },
    ])('omits the percentage for offset $offset and size $size', ({ offset, size }) => {
      const { state } = setup({
        Phase: phase,
        CurrentFileoffset: offset,
        CurrentFilesize: size,
        BackendFileProgress: offset,
        BackendFileSize: size,
      });
      expect(state.statusData()!.fileStatusText).toBe(`empty.txt | File processed: ${offset} bytes/${size} bytes`);
    });

    it('retains the percentage and chooses the correct progress fields for a positive size', () => {
      const usesBackend = phase !== 'Restore_DownloadingRemoteFiles';
      const { state } = setup({
        Phase: phase,
        CurrentFileoffset: 25,
        CurrentFilesize: 100,
        BackendFileProgress: 50,
        BackendFileSize: 100,
      });
      expect(state.statusData()!.fileStatusText).toBe(
        `empty.txt | File processed: ${usesBackend ? 50 : 25} bytes/100 bytes - ${usesBackend ? '50.0' : '25.0'}%`
      );
    });
  });

  it('does not display file progress without a filename', () => {
    const { state } = setup({ CurrentFilename: null });
    expect(state.statusData()!.fileStatusText).toBe('');
  });

  it('retains filename truncation for an empty file', () => {
    const filename = '/a/very/long/directory/path/containing/an/empty-file.txt';
    const { state } = setup({ CurrentFilename: filename });
    expect(state.statusData()!.fileStatusText).toBe(`...${filename.slice(-42)} | File processed: 0 bytes/0 bytes`);
  });

  it('updates the percentage when the file size becomes known', () => {
    const { state, progressState } = setup();
    expect(state.statusData()!.fileStatusText).not.toContain('%');
    progressState.update((value) => ({ ...value, CurrentFileoffset: 50, CurrentFilesize: 100 }));
    TestBed.tick();
    expect(state.statusData()!.fileStatusText).toBe('empty.txt | File processed: 50 bytes/100 bytes - 50.0%');
  });
});
