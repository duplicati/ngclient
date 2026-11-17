import { DecimalPipe } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, IListResultFileset } from '../../../core/openapi';
import { DayJsProvider } from '../../../core/providers/dayjs';
import { BackupsState } from '../../../core/states/backups.state';
import { findBackupVersion, GeneralLogComponent } from './general-log.component';

@Component({ template: '' })
class CommandlineStub {}

// Versions as the server lists them, newest first
const FILESETS: IListResultFileset[] = [
  { Version: 0, Time: '2026-11-03T10:00:01+01:00' },
  { Version: 1, Time: '2026-11-02T10:00:01+01:00' },
  { Version: 2, Time: '2026-11-01T10:00:00+01:00' },
];

function backupRow(id: number, beginTime: string, endTime: string, parsedResult = 'Success') {
  return {
    ID: id,
    OperationID: id,
    Timestamp: Date.parse(endTime) / 1000,
    Type: 'Result',
    Exception: {},
    Message: JSON.stringify({
      MainOperation: 'Backup',
      ParsedResult: parsedResult,
      BeginTime: beginTime,
      EndTime: endTime,
    }),
  };
}

describe('findBackupVersion', () => {
  it('finds the version created during the backup run', () => {
    expect(findBackupVersion(FILESETS, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z')).toBe(1);
  });

  it('accepts a version stamped shortly before the result began', () => {
    expect(findBackupVersion(FILESETS, '2026-11-01T09:00:20Z', '2026-11-01T09:01:00Z')).toBe(2);
  });

  it('returns null when the run kept no version', () => {
    expect(findBackupVersion(FILESETS, '2026-11-02T15:00:00Z', '2026-11-02T15:01:00Z')).toBeNull();
  });

  it('returns null without a begin time', () => {
    expect(findBackupVersion(FILESETS, undefined, '2026-11-02T09:05:00Z')).toBeNull();
  });
});

describe('GeneralLogComponent compare with previous version', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(rows: ReturnType<typeof backupRow>[], filesets: IListResultFileset[] = FILESETS) {
    const getFilesets = vi.fn(() => Promise.resolve(filesets));
    TestBed.configureTestingModule({
      imports: [GeneralLogComponent],
      providers: [
        DecimalPipe,
        DayJsProvider,
        provideRouter([{ path: 'backup/:id/commandline', component: CommandlineStub }]),
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1BackupById: () => Promise.resolve({}),
            getApiV1BackupByIdLog: () => Promise.resolve(rows),
            getApiV1BackupByIdFilesets: getFilesets,
          },
        },
        { provide: BackupsState, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(GeneralLogComponent);
    fixture.componentRef.setInput('backupId', '7');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const open = (id: number) => {
      fixture.componentInstance.openEntry.set(id);
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('.compare-version button') as HTMLButtonElement | null;
    };
    const click = async (button: HTMLButtonElement) => {
      button.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, open, click, getFilesets };
  }

  it('opens the command editor with COMPARE between the run and the version before it', async () => {
    const { open, click, getFilesets } = await render([backupRow(5, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z')]);
    const button = open(5);
    expect(button?.textContent).toContain('Compare with previous version');

    await click(button!);

    expect(getFilesets).toHaveBeenCalledExactlyOnceWith({ path: { id: '7' } });
    expect(TestBed.inject(Router).url).toBe('/backup/7/commandline?command=compare&base=2&target=1');
  });

  it('explains when the run kept no version instead of comparing other versions', async () => {
    const { fixture, open, click } = await render([backupRow(5, '2026-11-02T15:00:00Z', '2026-11-02T15:01:00Z')]);
    await click(open(5)!);

    expect(TestBed.inject(Router).url).toBe('/');
    expect(fixture.nativeElement.querySelector('.compare-version [role=status]')?.textContent).toContain(
      'This backup run has no version to compare.'
    );
  });

  it('explains when the run created the oldest version', async () => {
    const { fixture, open, click } = await render([backupRow(5, '2026-11-01T09:00:01Z', '2026-11-01T09:01:00Z')]);
    await click(open(5)!);

    expect(TestBed.inject(Router).url).toBe('/');
    expect(fixture.nativeElement.querySelector('.compare-version [role=status]')?.textContent).toContain(
      'There is no earlier version to compare with.'
    );
  });

  it('offers no comparison for a failed backup', async () => {
    const { open } = await render([backupRow(5, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z', 'Fatal')]);
    expect(open(5)).toBeNull();
  });
});
