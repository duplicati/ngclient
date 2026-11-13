import { describe, expect, it } from 'vitest';
import {
  describeMcpTokenBackups,
  emptyMcpTokenForm,
  getMcpServerDisableWarning,
  getMcpTokenFormError,
  McpTokenForm,
  parseRestoreRoots,
  toCreateMcpTokenRequest,
  toMcpEndpointUrl,
} from './mcp-token-settings';

function form(overrides: Partial<McpTokenForm>): McpTokenForm {
  return { ...emptyMcpTokenForm(), name: 'agent', ...overrides };
}

describe('MCP token settings', () => {
  it.each<[string | null | undefined, string[]]>([
    [undefined, []],
    [null, []],
    ['', []],
    ['  \n \r\n', []],
    ['/tmp/restore', ['/tmp/restore']],
    [' /tmp/a \r\n\nC:\\restore\n', ['/tmp/a', 'C:\\restore']],
  ])('splits the restore folders %j into %j', (value, expected) => {
    expect(parseRestoreRoots(value)).toEqual(expected);
  });

  it.each<[Partial<McpTokenForm>, string | null]>([
    [{}, null],
    [{ name: '   ' }, 'name'],
    [{ allBackups: false, backupIds: [] }, 'backups'],
    [{ allBackups: false, backupIds: ['1'] }, null],
    // The selection is ignored while all backups are allowed
    [{ allBackups: true, backupIds: [] }, null],
  ])('reports what is missing in %j as %j', (overrides, expected) => {
    expect(getMcpTokenFormError(form(overrides))).toBe(expected);
  });

  it('allows all backups by sending no list', () => {
    expect(toCreateMcpTokenRequest(form({ name: ' agent ', allBackups: true, backupIds: ['1'] }))).toEqual({
      Name: 'agent',
      Level: 'Restore',
      BackupIds: null,
      RestoreRoots: [],
      ExpiresIn: '90D',
    });
  });

  it('sends the selected backups and restore folders', () => {
    const request = toCreateMcpTokenRequest(
      form({ allBackups: false, backupIds: ['1', '3'], restoreRoots: '/tmp/a\n/tmp/b', expiresIn: '1Y' })
    );
    expect(request.BackupIds).toEqual(['1', '3']);
    expect(request.RestoreRoots).toEqual(['/tmp/a', '/tmp/b']);
    expect(request.ExpiresIn).toBe('1Y');
  });

  it.each(['Read', 'Backup'] as const)('leaves the restore folders out for the %s level', (level) => {
    expect(toCreateMcpTokenRequest(form({ level, restoreRoots: '/tmp/a' })).RestoreRoots).toEqual([]);
  });

  it('describes the backups of a token by name', () => {
    const names = new Map([['1', 'Documents']]);
    expect(describeMcpTokenBackups({ BackupIds: null }, names)).toBe('All backups');
    expect(describeMcpTokenBackups({ BackupIds: ['1'] }, names)).toBe('Documents');
    expect(describeMcpTokenBackups({ BackupIds: ['1', '7'] }, names)).toBe('Documents, Deleted backup (7)');
  });

  it('does not warn about turning off the MCP server when there are no tokens to lose', () => {
    expect(getMcpServerDisableWarning(0)).toBeNull();
  });

  it.each<[number | null, string]>([
    [1, 'deletes the access token.'],
    [3, 'deletes all 3 access tokens.'],
    // The number is not known while the list is loading, and the tokens are deleted all the same
    [null, 'deletes all access tokens.'],
  ])('warns that turning off the MCP server with %j tokens %s', (tokenCount, expected) => {
    const warning = getMcpServerDisableWarning(tokenCount);
    expect(warning).toContain(expected);
    expect(warning).toContain('turning the server on again does not bring');
  });

  it.each([
    ['http://localhost:8200', 'http://localhost:8200/mcp'],
    ['https://backup.example.com/', 'https://backup.example.com/mcp'],
  ])('builds the endpoint address from %s', (origin, expected) => {
    expect(toMcpEndpointUrl(origin)).toBe(expected);
  });
});
