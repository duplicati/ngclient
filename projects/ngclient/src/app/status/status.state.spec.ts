import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState, StatusWithContent } from '../core/components/status-bar/status-bar.state';
import { ServerStateService } from '../core/services/server-state.service';
import { StatusPageState } from './status.state';

describe('StatusPageState estimated totals', () => {
  let state: StatusPageState;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  });
  afterEach(() => {
    state?.deactivateView();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  const setup = () => {
    const progress = signal<StatusWithContent>({
      ProcessedFileCount: 0,
      ProcessedFileSize: 0,
      TotalFileCount: 10,
      TotalFileSize: 1000,
      progress: 0,
      statusText: '',
      fileStatusText: '',
      fileCountProgressText: '',
      actionText: '',
    });
    TestBed.configureTestingModule({
      providers: [
        StatusPageState,
        { provide: StatusBarState, useValue: { statusData: progress } },
        { provide: ServerStateService, useValue: {} },
      ],
    });
    state = TestBed.inject(StatusPageState);
    TestBed.tick();
    state.activateView();
    return progress;
  };

  it.each(['files', 'bytes'] as const)(
    'does not estimate a past completion from %s when processing exceeds the total',
    (metric) => {
      const progress = setup();
      progress.update((value) => ({
        ...value,
        TotalFileCount: 2,
        TotalFileSize: 100,
        ProcessedFileCount: metric === 'files' ? 5 : 0,
        ProcessedFileSize: metric === 'bytes' ? 200 : 0,
      }));
      vi.advanceTimersByTime(5000);
      expect(state.etaData()!.metric).toBe(metric);
      expect(state.etaData()!.estimatedCompletion?.getTime()).toBe(Date.now());
    }
  );

  it.each([0, -1])('does not estimate a past completion with total %s', (total) => {
    const progress = setup();
    progress.update((value) => ({
      ...value,
      TotalFileCount: total,
      TotalFileSize: total,
      ProcessedFileCount: 5,
      ProcessedFileSize: 200,
    }));
    vi.advanceTimersByTime(5000);
    expect(state.etaData()!.estimatedCompletion?.getTime()).toBe(Date.now());
  });

  it('retains positive rate calculations and the slower remaining-work estimate', () => {
    const progress = setup();
    progress.update((value) => ({ ...value, ProcessedFileCount: 5, ProcessedFileSize: 200 }));
    vi.advanceTimersByTime(5000);
    expect(state.etaData()!.currentFilesPerSecond).toBe(1);
    expect(state.etaData()!.currentBytesPerSecond).toBe(40);
    expect(state.etaData()!.metric).toBe('bytes');
    expect(state.etaData()!.estimatedCompletion?.getTime()).toBe(Date.now() + 20000);
  });

  it('does not estimate completion without a positive processing rate', () => {
    setup();
    vi.advanceTimersByTime(5000);
    expect(state.etaData()!.estimatedCompletion).toBeNull();
  });
});
