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
class CompareStub {}

// Versions as the server lists them, newest first
const FILESETS: IListResultFileset[] = [
  { Version: 0, Time: '2026-11-03T10:00:01+01:00' },
  { Version: 1, Time: '2026-11-02T10:00:01+01:00' },
  { Version: 2, Time: '2026-11-01T10:00:00+01:00' },
];

function backupRow(
  id: number,
  beginTime: string,
  endTime: string,
  parsedResult = 'Success',
  counts: Record<string, number> = { AddedFiles: 1 }
) {
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
      ...counts,
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
        provideRouter([{ path: 'backup/:id/compare', component: CompareStub }]),
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

  it('opens the comparison of the run with the version before it', async () => {
    const { open, click, getFilesets } = await render([backupRow(5, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z')]);
    const button = open(5);
    expect(button?.textContent).toContain('Compare with previous version');

    await click(button!);

    expect(getFilesets).toHaveBeenCalledExactlyOnceWith({ path: { id: '7' } });
    expect(TestBed.inject(Router).url).toBe('/backup/7/compare?base=2&target=1');
  });

  it('explains when the version of the run no longer exists', async () => {
    const { fixture, open, click } = await render([backupRow(5, '2026-11-02T15:00:00Z', '2026-11-02T15:01:00Z')]);
    await click(open(5)!);

    expect(TestBed.inject(Router).url).toBe('/');
    expect(fixture.nativeElement.querySelector('.compare-version [role=status]')?.textContent).toContain(
      'The version this backup run created no longer exists, so there is nothing to compare.'
    );
  });

  it('offers no comparison for a run without changes, which created no version', async () => {
    const counts = { AddedFiles: 0, ModifiedFiles: 0, DeletedFiles: 0, AddedFolders: 0, DeletedSymlinks: 0 };
    const { open } = await render([backupRow(5, '2026-11-04T09:00:00Z', '2026-11-04T09:01:00Z', 'Success', counts)]);
    expect(open(5)).toBeNull();
  });

  it('offers the comparison when only a folder changed, or when the result has no counts', async () => {
    const { open } = await render([
      backupRow(5, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z', 'Success', { AddedFiles: 0, DeletedFolders: 1 }),
      backupRow(6, '2026-11-01T09:00:01Z', '2026-11-01T09:01:00Z', 'Success', {}),
    ]);
    expect(open(5)).not.toBeNull();
    expect(open(6)).not.toBeNull();
  });

  it('compares the oldest version with the one after it', async () => {
    const { open, click } = await render([backupRow(5, '2026-11-01T09:00:01Z', '2026-11-01T09:01:00Z')]);
    await click(open(5)!);

    expect(TestBed.inject(Router).url).toBe('/backup/7/compare?base=2&target=1');
  });

  it('explains when the backup has only one version', async () => {
    const { fixture, open, click } = await render(
      [backupRow(5, '2026-11-01T09:00:01Z', '2026-11-01T09:01:00Z')],
      FILESETS.slice(2)
    );
    await click(open(5)!);

    expect(TestBed.inject(Router).url).toBe('/');
    expect(fixture.nativeElement.querySelector('.compare-version [role=status]')?.textContent).toContain(
      'This backup has only one version, so there is nothing to compare with.'
    );
  });

  it('shows the button in the source files card', async () => {
    const { open } = await render([backupRow(5, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z')]);
    expect(open(5)?.closest('sh-toggle-card')?.textContent).toContain('Source files');
  });

  it('offers no comparison for a failed backup', async () => {
    const { open } = await render([backupRow(5, '2026-11-02T09:00:02Z', '2026-11-02T09:05:00Z', 'Fatal')]);
    expect(open(5)).toBeNull();
  });
});
