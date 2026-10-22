import { DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { DayJsProvider } from '../../../core/providers/dayjs';
import { BackupsState } from '../../../core/states/backups.state';
import { GeneralLogComponent } from './general-log.component';

describe('GeneralLogComponent.parseWarning', () => {
  function setup(): GeneralLogComponent {
    TestBed.configureTestingModule({
      imports: [GeneralLogComponent],
      providers: [
        DecimalPipe,
        DayJsProvider,
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1BackupById: () => Promise.resolve({}),
            getApiV1BackupByIdLog: () => of([]),
          },
        },
        { provide: BackupsState, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(GeneralLogComponent);
    fixture.componentRef.setInput('backupId', '1');
    return fixture.componentInstance;
  }

  it('parses a single-line warning', () => {
    const component = setup();
    const parsed = component.parseWarning(
      '2026-10-10 17:26:02 +00 - [Warning-Duplicati.Library.SourceProvider.FileRestoreDestinationProvider-SymlinkTargetOutside]: Skipping creation of symlink'
    );

    expect(parsed).toEqual({
      Timestamp: '2026-10-10 17:26:02 +00',
      LogLevel: 'Warning',
      Source: 'Duplicati.Library.SourceProvider.FileRestoreDestinationProvider',
      MessageId: 'SymlinkTargetOutside',
      Message: 'Skipping creation of symlink',
    });
  });

  it('parses a warning whose message spans multiple lines', () => {
    const component = setup();
    const parsed = component.parseWarning(
      '2026-10-09 16.13.00 +02 - [Warning-Duplicati.Library.Main.Operation.Backup.FileBlockProcessor.FileEntry-FileProcessingFailed]: Failed to process path: /tmp/x\nHttpRequestException: Item not found (HTTP 404 NotFound)'
    );

    expect(parsed?.MessageId).toBe('FileProcessingFailed');
    expect(parsed?.Source).toBe('Duplicati.Library.Main.Operation.Backup.FileBlockProcessor.FileEntry');
    expect(parsed?.Message).toBe(
      'Failed to process path: /tmp/x\nHttpRequestException: Item not found (HTTP 404 NotFound)'
    );
  });

  it('uses the last segment as message id when the source contains hyphens', () => {
    const component = setup();
    const parsed = component.parseWarning('ts - [Warning-Some-Hyphenated.Source-TheId]: msg');

    expect(parsed?.Source).toBe('Some-Hyphenated.Source');
    expect(parsed?.MessageId).toBe('TheId');
  });

  it('returns null for text that is not a log line', () => {
    const component = setup();
    expect(component.parseWarning('just some text')).toBeNull();
  });
});

describe('GeneralLogComponent mixed log rows', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(rows: { ID: number; Type: string; Message: string }[]) {
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
              Promise.resolve(rows.map((row) => ({ ...row, Timestamp: 1700000000, OperationID: 7, Exception: {} }))),
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
    fixture.componentInstance.openEntry.set(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Legacy text <script>alert(1)</script>');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
  });

  it.each(['plain event text', '{"message":"future event"}'])(
    'displays non-Result rows verbatim: %s',
    async (message) => {
      const fixture = await render([{ ID: 4, Type: 'Event', Message: message }]);
      fixture.componentInstance.openEntry.set(4);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Event');
      expect(fixture.nativeElement.textContent).toContain(message);
    }
  );

  it.each(['null', '42', '"text"', '[]'])('displays non-object Result payload %s verbatim', async (message) => {
    const fixture = await render([{ ID: 5, Type: 'Result', Message: message }]);
    fixture.componentInstance.openEntry.set(5);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(message);
  });
});
