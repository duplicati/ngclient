/// <reference types="@angular/localize" />

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDatepickerInput } from '@ship-ui/core/ship-datepicker';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import dayjs from 'dayjs/esm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, ScheduleDto } from '../../core/openapi';
import { DAYJS } from '../../core/providers/dayjs';
import { TimespanLiteralsService } from '../../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import { BackupState } from '../backup.state';
import ScheduleComponent from './schedule.component';
import { formatAllowedDays } from './schedule-summary';

describe('schedule summary formatting', () => {
  it('formats all allowed days', () => {
    expect(
      formatAllowedDays(dayjs, { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true })
    ).toBe('All days');
  });

  it('formats no allowed days', () => {
    expect(
      formatAllowedDays(dayjs, { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
    ).toBe('No days selected');
  });

  it('formats a subset of allowed days', () => {
    expect(
      formatAllowedDays(dayjs, { mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false })
    ).toBe('Monday, Wednesday, and Friday');
  });
});

describe('ScheduleComponent date picker', () => {
  let fixture: ComponentFixture<ScheduleComponent>;
  let state: BackupState;

  async function renderSchedule(time: string) {
    TestBed.configureTestingModule({
      imports: [ScheduleComponent],
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: DAYJS, useValue: dayjs },
        { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: { fromString: () => ({ value: 1, unit: 'D' }) } },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
      ],
    });
    state = TestBed.inject(BackupState);
    state.mapScheduleToForm({ Time: time, Repeat: '1D', AllowedDays: ['mon', 'fri'] } as ScheduleDto);
    fixture = TestBed.createComponent(ScheduleComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(ShipDatepickerInput)).componentInstance as ShipDatepickerInput;
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllEnvs();
  });

  it.each([
    ['America/New_York', '2026-09-06T12:20:00.000Z'],
    ['Asia/Tokyo', '2026-09-05T23:20:00.000Z'],
    ['UTC', '2026-09-06T08:20:00.000Z'],
  ])('displays the loaded local day and preserves the saved instant in %s', async (timezone, time) => {
    vi.stubEnv('TZ', timezone);
    const picker = await renderSchedule(time);

    expect(state.scheduleFields.nextTime.date()).toBe('2026-09-06');
    expect(state.scheduleFields.nextTime.time()).toBe('08:20');
    expect(picker.internalDate()?.getFullYear()).toBe(2026);
    expect(picker.internalDate()?.getMonth()).toBe(8);
    expect(picker.internalDate()?.getDate()).toBe(6);
    expect(fixture.nativeElement.querySelector('sh-datepicker-input .masked-value').textContent.trim()).toBe(
      'Sep 6, 2026'
    );
    expect(state.getScheduleFormValue()).toEqual({
      Time: time,
      Repeat: '1D',
      AllowedDays: ['Monday', 'Friday'],
    });
  });

  it('saves a new calendar selection as the selected local day', async () => {
    vi.stubEnv('TZ', 'America/New_York');
    const picker = await renderSchedule('2026-09-06T12:20:00.000Z');

    picker.onDateChange(new Date(2026, 8, 7));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(state.getScheduleFormValue()?.Time).toBe('2026-09-07T12:20:00.000Z');
    expect(picker.internalDate()?.getDate()).toBe(7);
  });

  it('keeps an empty date empty instead of displaying an invalid date', async () => {
    vi.stubEnv('TZ', 'America/New_York');
    const picker = await renderSchedule('2026-09-06T12:20:00.000Z');

    state.scheduleFields.nextTime.date.set('');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(picker.internalDate()).toBeNull();
    expect(fixture.nativeElement.querySelector('sh-datepicker-input .masked-value').textContent.trim()).toBe('');
  });
});
