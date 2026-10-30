import { DatePipe } from '@angular/common';
import { DayJsProvider } from '../../providers/dayjs';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupsState } from '../../states/backups.state';
import { StatusBarState } from '../status-bar/status-bar.state';
import { BackupProgressComponent } from './backup-progress.component';

describe('BackupProgressComponent task visibility', () => {
  let fixture: ComponentFixture<BackupProgressComponent>;
  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });
  function setup(backupId?: string | number) {
    const runningBackupId = signal<string | number | null>(null);
    const statusData = signal({
      actionText: 'Backing up',
      statusText: 'Scanning',
      progress: 0.25,
      CurrentFilename: '/source/first.txt',
    });
    const serverState = signal<any>({ ProposedSchedule: [], ActiveTask: null });
    TestBed.configureTestingModule({
      imports: [BackupProgressComponent],
      providers: [
        DatePipe,
        DayJsProvider,
        { provide: StatusBarState, useValue: { runningBackupId, statusData, serverState } },
        { provide: BackupsState, useValue: { backups: signal([]) } },
      ],
    });
    fixture = TestBed.createComponent(BackupProgressComponent);
    if (backupId !== undefined) fixture.componentRef.setInput('backupId', backupId);
    fixture.detectChanges();
    return { component: fixture.componentInstance, runningBackupId, statusData, serverState };
  }

  it('shows an idle message in global mode', () => {
    setup();
    expect(fixture.nativeElement.classList.contains('is-visible')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('No scheduled tasks');
  });

  it('shows progress only for the matching job, accepting numeric and string IDs', () => {
    const { runningBackupId } = setup('42');
    expect(fixture.nativeElement.querySelector('.progress-section')).toBeNull();
    runningBackupId.set(42);
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('is-visible')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Scanning');
    runningBackupId.set('43');
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('is-visible')).toBe(false);
    expect(fixture.nativeElement.querySelector('.progress-section')).toBeNull();
    runningBackupId.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.progress-section')).toBeNull();
  });

  it('shows the active operation in global mode and returns to idle after completion', () => {
    const { runningBackupId } = setup();
    runningBackupId.set('42');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Backing up -');
    expect(fixture.nativeElement.textContent).toContain('Scanning');
    runningBackupId.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No scheduled tasks');
  });

  it('renders the next scheduled job while idle', () => {
    const { serverState } = setup();
    serverState.set({
      ProposedSchedule: [{ backup: { Backup: { Name: 'Documents' } }, Item2: '2026-10-30T04:00:00Z' }],
      ActiveTask: null,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Documents');
    expect(fixture.nativeElement.textContent).not.toContain('No scheduled tasks');
  });

  it('resets copied-file feedback when the current file changes', () => {
    const { component, statusData } = setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const event = new Event('click');
    const stop = vi.spyOn(event, 'stopPropagation');
    component.copyToClipboard(event, component.tooltipText());
    expect(writeText).toHaveBeenCalledWith('/source/first.txt');
    expect(stop).toHaveBeenCalledOnce();
    expect(component.copied()).toBe(true);
    statusData.update((x) => ({ ...x, CurrentFilename: '/source/second.txt' }));
    fixture.detectChanges();
    expect(component.tooltipText()).toBe('/source/second.txt');
    expect(component.copied()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    component.copyToClipboard(event, component.tooltipText());
    vi.advanceTimersByTime(2000);
    expect(component.copied()).toBe(false);
  });
});
