import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupDto, DuplicatiServer, ScheduleDto } from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { BackupState } from './backup.state';

describe('BackupState', () => {
  let state: BackupState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: { fromString: () => ({ value: 1, unit: 'D' }) } },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
      ],
    });

    state = TestBed.inject(BackupState);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    TestBed.resetTestingModule();
  });

  it('assigns a distinct UI key to each loaded destination', () => {
    state.mapDestinationToForm({
      TargetURL: 'file://C:/backup',
      ConnectionStringID: -1,
      AdditionalTargetURLs: [
        {
          TargetUrl: 'webdav://example.com/backup',
          ConnectionStringID: -1,
          UrlKey: 'secondary',
          Mode: null,
          Options: null,
        },
      ],
    } as BackupDto);

    const [local, webdav] = state.targetUrls();

    expect(local.uiKey).toBeTruthy();
    expect(webdav.uiKey).toBeTruthy();
    expect(local.uiKey).not.toBe(webdav.uiKey);
  });

  it('preserves the UI key when a destination is updated', () => {
    state.addTargetUrl('webdav://example.com/backup', null, 'secondary');
    const originalKey = state.targetUrls()[0].uiKey;

    state.updateTargetUrl(0, 'webdav://example.com/updated', 42, 'secondary');
    state.toggleSaveConnectionString(0);

    expect(state.targetUrls()[0]).toMatchObject({
      uiKey: originalKey,
      url: 'webdav://example.com/updated',
      connectionStringId: 42,
      urlKey: 'secondary',
    });
  });

  it('retains synchronization settings and unknown options when loading and editing a secondary URL', () => {
    const options = { count: 3, 'future-option': { enabled: true } };
    state.mapDestinationToForm({
      TargetURL: 'file:///primary',
      AdditionalTargetURLs: [
        {
          TargetUrl: 'file:///secondary',
          ConnectionStringID: 8,
          UrlKey: 'second',
          Mode: 'interval',
          Interval: '2D',
          Options: options,
        },
      ],
    } as unknown as BackupDto);
    expect(state.targetUrls()[1]).toMatchObject({ mode: 'interval', interval: '2D', options });
    state.updateTargetUrl(1, 'file:///changed', 9, 'second');
    expect(state.targetUrls()[1]).toMatchObject({ mode: 'interval', interval: '2D', options });
    expect(options).toEqual({ count: 3, 'future-option': { enabled: true } });
  });

  it('round-trips a loaded schedule without changing its local date', () => {
    vi.stubEnv('TZ', 'America/New_York');
    state.mapScheduleToForm({
      Time: '2026-06-14T12:50:00Z',
      Repeat: '1D',
      AllowedDays: ['mon', 'fri'],
    } as ScheduleDto);

    expect(state.scheduleForm.nextTime.date().value()).toBe('2026-06-14');
    expect(state.scheduleForm.nextTime.time().value()).toBe('08:50');
    expect(state.scheduleForm.runAgain.allowedDays.mon().value()).toBe(true);
    expect(state.scheduleForm.runAgain.allowedDays.fri().value()).toBe(true);
    expect(state.getScheduleFormValue()?.Time).toBe('2026-06-14T12:50:00.000Z');
  });

  describe('server schedule defaults', () => {
    // Same shape as newbackup.json served by /api/v1/backupdefaults: a time without a date
    const serverDefault = {
      Repeat: '1D',
      Time: '13:00:00',
      AllowedDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    } as unknown as ScheduleDto;

    afterEach(() => vi.useRealTimers());

    it('starts today when the default time is still ahead', () => {
      vi.stubEnv('TZ', 'Asia/Tokyo');
      vi.useFakeTimers({ now: new Date('2026-10-20T01:00:00.000Z'), toFake: ['Date'] });

      state.mapScheduleToForm(serverDefault);

      expect(state.scheduleForm.nextTime.date().value()).toBe('2026-10-20');
      expect(state.getScheduleFormValue()?.Time).toBe('2026-10-20T04:00:00.000Z');
      expect(state.scheduleType()).toBe('daily');
    });

    it('starts tomorrow when the default time has already passed', () => {
      vi.stubEnv('TZ', 'Asia/Tokyo');
      vi.useFakeTimers({ now: new Date('2026-10-20T06:00:00.000Z'), toFake: ['Date'] });

      state.mapScheduleToForm(serverDefault);

      expect(state.scheduleForm.nextTime.date().value()).toBe('2026-10-21');
      expect(state.getScheduleFormValue()?.Time).toBe('2026-10-21T04:00:00.000Z');
      expect(state.scheduleType()).toBe('daily');
    });
  });

  it('preserves file attribute exclusions when options are loaded and saved', () => {
    state.mapOptionsToForms({
      Settings: [{ Name: '--exclude-files-attributes', Value: 'hidden' }],
    } as BackupDto);

    expect(state.mapFormsToSettings()).toContainEqual({
      Name: '--exclude-files-attributes',
      Value: 'hidden',
    });
  });

  it('continues to round-trip the managed keep-versions option', () => {
    state.mapOptionsToForms({
      Settings: [{ Name: 'keep-versions', Value: '5' }],
    } as BackupDto);

    expect(state.mapFormsToSettings()).toContainEqual({
      Name: 'keep-versions',
      Value: '5',
    });
  });
});
