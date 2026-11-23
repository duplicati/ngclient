import { describe, expect, it } from 'vitest';
import {
  applyEmailValues,
  parseLevels,
  readEmailOptions,
  sameOptionValue,
  serializeLevels,
  toEmailValues,
} from './email-reports';

describe('email report helpers', () => {
  it('reads send-mail options with or without leading dashes', () => {
    const raw = readEmailOptions([
      { Name: '--send-mail-to', Value: 'a@example.com' },
      { Name: 'send-mail-url', Value: 'smtps://mail.example.com' },
      { Name: 'send-mail-accept-any-ssl-certificate', Value: true },
      { Name: '--retry-delay', Value: '10s' },
    ]);
    expect(raw).toEqual({
      'send-mail-to': 'a@example.com',
      'send-mail-url': 'smtps://mail.example.com',
      'send-mail-accept-any-ssl-certificate': 'true',
    });
    expect(toEmailValues(raw)).toEqual({
      to: 'a@example.com',
      url: 'smtps://mail.example.com',
      acceptAnyCertificate: 'true',
    });
  });

  it('updates, adds and removes options while keeping unrelated ones', () => {
    const result = applyEmailValues(
      [
        { Name: '--send-mail-to', Value: 'old@example.com' },
        { Name: 'send-mail-username', Value: 'old' },
        { Name: 'send-mail-extra-parameters', Value: 'keep' },
        { Name: 'retry-delay', Value: '10s' },
      ],
      { to: ' new@example.com ', username: '', url: 'smtp://mail.example.com' }
    );
    expect(result).toEqual([
      { Name: '--send-mail-to', Value: 'new@example.com' },
      { Name: 'send-mail-extra-parameters', Value: 'keep' },
      { Name: 'retry-delay', Value: '10s' },
      { Name: 'send-mail-url', Value: 'smtp://mail.example.com' },
    ]);
  });

  it('parses and serializes result levels', () => {
    expect(parseLevels(undefined)).toEqual(['Success', 'Warning', 'Error', 'Fatal']);
    expect(parseLevels('all')).toEqual(['Success', 'Warning', 'Error', 'Fatal']);
    expect(parseLevels(' error, fatal ')).toEqual(['Error', 'Fatal']);
    expect(serializeLevels(['Fatal', 'Warning'])).toBe('Warning,Fatal');
    expect(serializeLevels(['Fatal', 'Warning', 'Error', 'Success'])).toBe('All');
    expect(sameOptionValue('All', 'all')).toBe(true);
    expect(sameOptionValue('Backup,Restore', ' restore ,backup')).toBe(true);
  });
});
