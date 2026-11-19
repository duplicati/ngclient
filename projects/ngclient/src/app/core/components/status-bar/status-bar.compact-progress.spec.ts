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

describe('StatusBarState compact progress', () => {
  afterEach(() => TestBed.resetTestingModule());

  const setup = (overrides: GetApiV1ProgressstateResponse = {}) => {
    const progressState = signal<GetApiV1ProgressstateResponse>({
      TaskID: 42,
      Phase: 'Backup_Compact',
      OverallProgress: 0,
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

  describe.each(['Backup_Delete', 'Backup_Compact'])('%s', (phase) => {
    it('moves with the progress the compact reports', () => {
      const { state, progressState } = setup({ Phase: phase, OverallProgress: 0.96 });
      expect(state.statusData()!.progress).toBeCloseTo(0.96);

      progressState.update((value) => ({ ...value, OverallProgress: 0.975 }));
      TestBed.tick();
      expect(state.statusData()!.progress).toBeCloseTo(0.975);
    });

    it.each([
      { label: 'no reported progress', reported: undefined, expected: 0.95 },
      { label: 'zero, as older servers report', reported: 0, expected: 0.95 },
      { label: 'progress below the range', reported: 0.5, expected: 0.95 },
      { label: 'progress above the range', reported: 1, expected: 0.98 },
    ])('keeps $label inside 0.95-0.98', ({ reported, expected }) => {
      const { state } = setup({ Phase: phase, OverallProgress: reported });
      expect(state.statusData()!.progress).toBeCloseTo(expected);
    });
  });
});
