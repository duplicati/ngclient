import { DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
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
