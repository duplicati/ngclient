import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { DayJsProvider } from '../../../core/providers/dayjs';
import { BackupsState } from '../../../core/states/backups.state';
import { GeneralLogComponent } from './general-log.component';

describe('GeneralLogComponent mixed log rows', () => {
  type Row = { ID: number; Type: string; Message: string; Exception?: unknown };

  async function render(rows: Row[]) {
    TestBed.configureTestingModule({
      imports: [GeneralLogComponent],
      providers: [
        DecimalPipe,
        DayJsProvider,
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1BackupById: () => Promise.resolve({}),
            getApiV1BackupByIdLog: () =>
              Promise.resolve(rows.map((row) => ({ Timestamp: 1700000000, OperationID: 7, Exception: {}, ...row }))),
          },
        },
        { provide: BackupsState, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(GeneralLogComponent);
    fixture.componentRef.setInput('backupId', '1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function open(fixture: ComponentFixture<GeneralLogComponent>, id: number) {
    fixture.componentInstance.openEntry.set(id);
    fixture.detectChanges();
    return fixture.nativeElement.querySelectorAll('.raw-log code') as NodeListOf<HTMLElement>;
  }

  function statusClasses(fixture: ComponentFixture<GeneralLogComponent>) {
    return Array.from(fixture.nativeElement.querySelectorAll('.status') as NodeListOf<HTMLElement>).map(
      (el) => el.className
    );
  }

  it('keeps valid results visible when a Result row contains plain text', async () => {
    const fixture = await render([
      { ID: 1, Type: 'Result', Message: JSON.stringify({ MainOperation: 'Backup', ParsedResult: 'Success' }) },
      { ID: 2, Type: 'Result', Message: 'Legacy text <script>alert(1)</script>' },
      { ID: 3, Type: 'Result', Message: JSON.stringify({ MainOperation: 'Sync', ParsedResult: 'Success' }) },
    ]);
    expect(fixture.componentInstance.resource.error()).toBeUndefined();
    expect(fixture.nativeElement.querySelectorAll('article.log-entry')).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('Backup');
    expect(fixture.nativeElement.textContent).toContain('Sync');
    const raw = open(fixture, 2);
    expect(raw[0].textContent).toContain('Legacy text <script>alert(1)</script>');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
  });

  it.each(['plain event text', '{"message":"future event"}'])(
    'displays non-Result rows verbatim: %s',
    async (message) => {
      const fixture = await render([{ ID: 4, Type: 'Event', Message: message }]);
      const raw = open(fixture, 4);
      expect(raw).toHaveLength(1);
      expect(raw[0].textContent).toContain(message);
    }
  );

  it.each(['null', '42', '"text"', '[]'])('displays non-object Result payload %s verbatim', async (message) => {
    const fixture = await render([{ ID: 5, Type: 'Result', Message: message }]);
    const raw = open(fixture, 5);
    expect(raw[0].textContent).toContain(message);
  });

  it('shows the exception of a raw row', async () => {
    const fixture = await render([
      { ID: 6, Type: 'Error', Message: 'Failed to connect', Exception: { Message: 'Connection refused' } },
    ]);
    const raw = open(fixture, 6);
    expect(raw).toHaveLength(2);
    expect(raw[1].textContent).toContain('Connection refused');
  });

  it('shows a string exception without JSON quotes', async () => {
    const fixture = await render([
      { ID: 7, Type: 'Error', Message: 'Failed to connect', Exception: 'SocketException: Connection refused' },
    ]);
    const raw = open(fixture, 7);
    expect(raw[1].textContent?.trim()).toBe('SocketException: Connection refused');
  });

  it('never marks raw rows as successful', async () => {
    const fixture = await render([
      { ID: 1, Type: 'Result', Message: JSON.stringify({ MainOperation: 'Backup', ParsedResult: 'Success' }) },
      { ID: 2, Type: 'Result', Message: JSON.stringify({ MainOperation: 'Backup', ParsedResult: 'Warning' }) },
      { ID: 3, Type: 'Result', Message: 'not json' },
      { ID: 4, Type: 'Error', Message: 'boom' },
      { ID: 5, Type: 'Warning', Message: 'careful' },
    ]);
    expect(statusClasses(fixture)).toEqual(['status', 'status warn', 'status unknown', 'status error', 'status warn']);
  });

  it('shows warnings as compact rows that expand to the full message', async () => {
    const warning =
      '2026-10-09 16.13.00 +02 - [Warning-Duplicati.Library.Main.FileEntry-FileProcessingFailed]: Failed to process path: /tmp/x\nHttpRequestException: Item not found';
    const fixture = await render([
      {
        ID: 8,
        Type: 'Result',
        Message: JSON.stringify({
          MainOperation: 'Backup',
          ParsedResult: 'Warning',
          WarningsActualLength: 1,
          Warnings: [warning, 'unstructured warning'],
        }),
      },
    ]);
    fixture.componentInstance.openEntry.set(8);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.log-line-row') as NodeListOf<HTMLButtonElement>;
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.log-time')?.textContent?.trim()).toBe('16:13:00');
    expect(rows[0].querySelector('.log-tag')?.textContent?.trim()).toBe('FileProcessingFailed');
    expect(rows[0].querySelector('.log-summary')?.textContent?.trim()).toBe('Failed to process path: /tmp/x');
    expect(rows[1].querySelector('.log-tag')).toBeNull();
    expect(rows[1].querySelector('.log-summary')?.textContent?.trim()).toBe('unstructured warning');
    expect(fixture.nativeElement.querySelector('.log-details')).toBeNull();

    rows[0].click();
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('.log-details') as HTMLElement;
    expect(details.querySelector('pre')?.textContent).toContain('HttpRequestException: Item not found');
    expect(details.textContent).toContain('Suppress');
  });
});
