/// <reference types="@angular/localize" />

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDatepickerInput } from '@ship-ui/core/ship-datepicker';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import dayjs from 'dayjs/esm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupAndScheduleOutputDto, DuplicatiServer, ScheduleDto } from '../../core/openapi';
import { DAYJS } from '../../core/providers/dayjs';
import { TimespanLiteralsService } from '../../core/services/timespan-literals.service';
import { BackupsState } from '../../core/states/backups.state';
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
        { provide: SysinfoState, useValue: { systemInfo: signal(null), hasBackupRunAfter: signal(false) } },
        { provide: BackupsState, useValue: { backups: signal([]), getBackups: vi.fn() } },
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
    vi.useRealTimers();
  });

  it.each([
    ['Monday before 13:00', '2026-10-12T01:00:00.000Z', '2026-10-12'],
    ['Monday exactly at 13:00', '2026-10-12T04:00:00.000Z', '2026-10-19'],
    ['Monday after 13:00', '2026-10-12T06:00:00.000Z', '2026-10-19'],
    ['Tuesday', '2026-10-13T01:00:00.000Z', '2026-10-19'],
  ])('starts the weekly preset on the next eligible Monday: %s', async (_, now, expectedDate) => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    vi.useFakeTimers({ now: new Date(now), toFake: ['Date'] });
    await renderSchedule('2026-09-06T12:20:00.000Z');

    fixture.componentInstance.updateScheduleType('weekly');

    expect(state.scheduleForm.nextTime.date().value()).toBe(expectedDate);
    expect(state.scheduleForm.nextTime.time().value()).toBe('13:00:00');
    expect(state.getScheduleFormValue()).toEqual({
      Time: expectedDate + 'T04:00:00.000Z',
      Repeat: '1W',
      AllowedDays: ['Monday'],
    });
  });

  it('starts a predefined schedule at its next future run', async () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    // Tuesday 2026-10-20 15:00 in Tokyo, after the 13:00 preset time
    vi.useFakeTimers({ now: new Date('2026-10-20T06:00:00.000Z'), toFake: ['Date'] });
    await renderSchedule('2026-09-06T12:20:00.000Z');

    fixture.componentInstance.updateScheduleType('daily');
    expect(state.scheduleForm.nextTime.date().value()).toBe('2026-10-21');

    fixture.componentInstance.updateScheduleType('weekly');
    expect(state.scheduleForm.nextTime.date().value()).toBe('2026-10-26');
  });

  it.each([
    ['America/New_York', '2026-09-06T12:20:00.000Z'],
    ['Asia/Tokyo', '2026-09-05T23:20:00.000Z'],
    ['UTC', '2026-09-06T08:20:00.000Z'],
  ])('displays the loaded local day and preserves the saved instant in %s', async (timezone, time) => {
    vi.stubEnv('TZ', timezone);
    const picker = await renderSchedule(time);

    expect(state.scheduleForm.nextTime.date().value()).toBe('2026-09-06');
    expect(state.scheduleForm.nextTime.time().value()).toBe('08:20');
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

  it('serializes native input edits and keeps bindings connected after resetting the form', async () => {
    vi.stubEnv('TZ', 'UTC');
    await renderSchedule('2026-09-06T08:20:00.000Z');
    const time = fixture.nativeElement.querySelector('#time') as HTMLInputElement;
    time.value = '09:45';
    time.dispatchEvent(new Event('input', { bubbles: true }));
    time.dispatchEvent(new Event('blur'));
    const repeat = fixture.nativeElement.querySelector('#repeatValue') as HTMLInputElement;
    repeat.value = '3';
    repeat.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(state.getScheduleFormValue()).toEqual({
      Time: '2026-09-06T09:45:00.000Z',
      Repeat: '3D',
      AllowedDays: ['Monday', 'Friday'],
    });
    expect(state.scheduleForm.nextTime.time().dirty()).toBe(true);
    expect(state.scheduleForm.nextTime.time().touched()).toBe(true);
    state.scheduleForm().reset({ ...state.scheduleModel(), nextTime: { date: '2026-09-07', time: '11:30' } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(time.value).toBe('11:30');
    expect(state.getScheduleFormValue()?.Time).toBe('2026-09-07T11:30:00.000Z');
    expect(state.scheduleForm().dirty()).toBe(false);
  });

  it('keeps an empty date empty instead of displaying an invalid date', async () => {
    vi.stubEnv('TZ', 'America/New_York');
    const picker = await renderSchedule('2026-09-06T12:20:00.000Z');

    state.scheduleForm.nextTime.date().value.set('');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(picker.internalDate()).toBeNull();
    expect(fixture.nativeElement.querySelector('sh-datepicker-input .masked-value').textContent.trim()).toBe('');
  });
});

describe('ScheduleComponent run after another job', () => {
  let fixture: ComponentFixture<ScheduleComponent>;
  let state: BackupState;

  const jobs = [
    { Backup: { ID: '1', Name: 'Nightly', RunAfterBackupID: null }, Schedule: { Repeat: '1D' } },
    { Backup: { ID: '2', Name: 'Copy to cloud', RunAfterBackupID: '1' }, Schedule: null },
    { Backup: { ID: '3', Name: 'Manual only', RunAfterBackupID: null }, Schedule: null },
  ] as unknown as BackupAndScheduleOutputDto[];

  const backups = signal<BackupAndScheduleOutputDto[]>([]);
  const getBackups = vi.fn();

  async function renderSchedule(supported: boolean, backupId: string) {
    backups.set(jobs);
    await renderLoadedSchedule(supported, backupId, null);
  }

  // Renders the page for a saved job, as the editor does after loading the job from the server
  async function renderLoadedSchedule(supported: boolean, backupId: string, runAfter: string | null) {
    getBackups.mockClear();
    TestBed.configureTestingModule({
      imports: [ScheduleComponent],
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: DAYJS, useValue: dayjs },
        { provide: SysinfoState, useValue: { systemInfo: signal(null), hasBackupRunAfter: signal(supported) } },
        { provide: BackupsState, useValue: { backups, getBackups } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: { fromString: () => ({ value: 1, unit: 'D' }) } },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
      ],
    });
    state = TestBed.inject(BackupState);
    state.backupId.set(backupId);
    state.runAfterBackupId.set(runAfter);
    fixture = TestBed.createComponent(ScheduleComponent);
    await render();
  }

  const selectedLabel = () =>
    (section()!.querySelector('sh-select .selected-value') as HTMLElement).textContent!.trim();

  async function render() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const section = () => fixture.nativeElement.querySelector('.run-after') as HTMLElement | null;

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('stores and clears the predecessor selected with the picker', async () => {
    HTMLElement.prototype.showPopover ??= vi.fn();
    HTMLElement.prototype.hidePopover ??= vi.fn();
    await renderSchedule(true, '3');
    section()!.querySelector<HTMLElement>('sh-select sh-form-field')!.click();
    await render();
    Array.from(section()!.querySelectorAll<HTMLElement>('li.option'))
      .find((option) => option.textContent.trim() === 'Nightly')!
      .click();
    await render();
    expect(state.runAfterBackupId()).toBe('1');
    expect(selectedLabel()).toBe('Nightly');

    state.runAfterAlways.set(true);
    Array.from(section()!.querySelectorAll<HTMLElement>('sh-select sh-icon[suffix]'))
      .find((icon) => icon.textContent.trim() === 'x-bold')!
      .click();
    await render();
    expect(state.runAfterBackupId()).toBeNull();
    expect(state.runAfterAlways()).toBe(false);
  });

  it('hides the choice when the server cannot run a job after another job', async () => {
    await renderSchedule(false, '3');
    expect(section()).toBeNull();
  });

  it('offers the other jobs, without the jobs that run after this one', async () => {
    await renderSchedule(true, '1');
    expect(section()).not.toBeNull();
    expect(fixture.componentInstance.runAfterOptions()).toEqual([{ value: '3', label: 'Manual only' }]);
    expect(section()!.querySelector('#runAfterAlways')).toBeNull();
  });

  it('stores the picked job and offers to run after a failed run', async () => {
    await renderSchedule(true, '3');

    fixture.componentInstance.setRunAfter('1');
    await render();
    expect(state.runAfterBackupId()).toBe('1');
    expect(section()!.querySelector('#runAfterAlways')).not.toBeNull();
    expect(section()!.querySelector('.run-after-warning')).toBeNull();

    const checkbox = section()!.querySelector<HTMLInputElement>('#runAfterAlways')!;
    checkbox.click();
    await render();
    expect(state.runAfterAlways()).toBe(true);
    checkbox.click();
    await render();
    expect(state.runAfterAlways()).toBe(false);
    checkbox.click();
    fixture.componentInstance.setRunAfter(null);
    await render();
    expect(state.runAfterBackupId()).toBeNull();
    expect(state.runAfterAlways()).toBe(false);
    expect(section()!.querySelector('#runAfterAlways')).toBeNull();
  });

  it('shows the stored job when the list of jobs is already loaded', async () => {
    backups.set(jobs);
    await renderLoadedSchedule(true, '2', '1');

    expect(state.runAfterBackupId()).toBe('1');
    expect(selectedLabel()).toBe('Nightly');
    expect(section()!.querySelector('#runAfterAlways')).not.toBeNull();
  });

  it('keeps the stored job when the list of jobs arrives after the page is shown', async () => {
    // Opening the editor directly shows the page before the list of jobs is loaded
    backups.set([]);
    await renderLoadedSchedule(true, '2', '1');

    expect(getBackups).toHaveBeenCalled();
    expect(state.runAfterBackupId()).toBe('1');
    expect(section()!.querySelector('#runAfterAlways')).not.toBeNull();

    backups.set(jobs);
    await render();
    expect(state.runAfterBackupId()).toBe('1');
    expect(selectedLabel()).toBe('Nightly');

    // An update of the list that changes no names leaves the choice alone
    backups.set(jobs.map((x) => ({ ...x })));
    await render();
    expect(state.runAfterBackupId()).toBe('1');
    expect(selectedLabel()).toBe('Nightly');
  });

  it('removes the job when the choice is emptied', async () => {
    backups.set(jobs);
    await renderLoadedSchedule(true, '2', '1');

    const input = section()!.querySelector('sh-select input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await render();

    expect(state.runAfterBackupId()).toBeNull();
    expect(section()!.querySelector('#runAfterAlways')).toBeNull();
  });

  it('warns when the picked job does not start by itself', async () => {
    await renderSchedule(true, '2');

    fixture.componentInstance.setRunAfter('3');
    await render();
    expect(section()!.querySelector('.run-after-warning')).not.toBeNull();
  });
});
