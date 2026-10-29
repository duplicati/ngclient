import { describe, expect, it } from 'vitest';
import { parseLogLine } from './log-line';

describe('parseLogLine', () => {
  it('parses a single-line warning', () => {
    const parsed = parseLogLine(
      '2026-10-10 17:26:02 +00 - [Warning-Duplicati.Library.SourceProvider.FileRestoreDestinationProvider-SymlinkTargetOutside]: Skipping creation of symlink'
    );

    expect(parsed).toMatchObject({
      parsed: true,
      timestamp: '2026-10-10 17:26:02 +00',
      time: '17:26:02',
      level: 'warning',
      source: 'Duplicati.Library.SourceProvider.FileRestoreDestinationProvider',
      tag: 'SymlinkTargetOutside',
      summary: 'Skipping creation of symlink',
      details: 'Skipping creation of symlink',
    });
  });

  it('keeps the first line as summary when the message spans multiple lines', () => {
    const parsed = parseLogLine(
      '2026-10-09 16.13.00 +02 - [Warning-Duplicati.Library.Main.Operation.Backup.FileBlockProcessor.FileEntry-FileProcessingFailed]: Failed to process path: /tmp/x\nHttpRequestException: Item not found (HTTP 404 NotFound)'
    );

    expect(parsed.tag).toBe('FileProcessingFailed');
    expect(parsed.source).toBe('Duplicati.Library.Main.Operation.Backup.FileBlockProcessor.FileEntry');
    expect(parsed.time).toBe('16:13:00');
    expect(parsed.summary).toBe('Failed to process path: /tmp/x');
    expect(parsed.details).toBe(
      'Failed to process path: /tmp/x\nHttpRequestException: Item not found (HTTP 404 NotFound)'
    );
  });

  it('uses the last segment as tag when the source contains hyphens', () => {
    const parsed = parseLogLine('ts - [Warning-Some-Hyphenated.Source-TheId]: msg');

    expect(parsed.source).toBe('Some-Hyphenated.Source');
    expect(parsed.tag).toBe('TheId');
  });

  it('takes the time of day, not a dotted date', () => {
    expect(parseLogLine('20.10.2026 14.56.54 - [Error-Src-Id]: x').time).toBe('14:56:54');
  });

  it('keeps text that is not a log line whole, with the fallback level', () => {
    const parsed = parseLogLine('just some text\nsecond line', 'error');

    expect(parsed).toMatchObject({
      parsed: false,
      time: null,
      tag: null,
      level: 'error',
      summary: 'just some text',
      details: 'just some text\nsecond line',
    });
  });
});
