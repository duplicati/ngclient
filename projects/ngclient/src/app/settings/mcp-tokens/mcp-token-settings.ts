import { CreateMcpTokenInputDto, McpTokenDto, McpTokenLevel } from '../../core/openapi';

/** The path of the MCP endpoint on the server */
export const MCP_ENDPOINT_PATH = '/mcp';

export const MCP_TOKEN_LEVEL_OPTIONS: { value: McpTokenLevel; label: string }[] = [
  {
    value: 'Read',
    label: $localize`Read: list backups, follow tasks and browse backup contents`,
  },
  {
    value: 'Backup',
    label: $localize`Backup: also run backups and stop tasks`,
  },
  {
    value: 'Restore',
    label: $localize`Restore: also restore files`,
  },
];

export const MCP_TOKEN_LIFETIME_OPTIONS: { value: string; label: string }[] = [
  {
    value: '1D',
    label: $localize`1 day`,
  },
  {
    value: '30D',
    label: $localize`30 days`,
  },
  {
    value: '90D',
    label: $localize`90 days`,
  },
  {
    value: '1Y',
    label: $localize`1 year`,
  },
  {
    value: '10Y',
    label: $localize`10 years`,
  },
];

export const DEFAULT_MCP_TOKEN_LIFETIME = '90D';

/** What the user has entered for a new token */
export type McpTokenForm = {
  name: string;
  level: McpTokenLevel;
  /** True to let the token use every backup, including ones created later */
  allBackups: boolean;
  backupIds: string[];
  /** The folders the token can restore into, one per line */
  restoreRoots: string;
  expiresIn: string;
};

export type McpTokenFormError = 'name' | 'backups';

export function emptyMcpTokenForm(): McpTokenForm {
  return {
    name: '',
    level: 'Restore',
    allBackups: true,
    backupIds: [],
    restoreRoots: '',
    expiresIn: DEFAULT_MCP_TOKEN_LIFETIME,
  };
}

/** Splits the restore folders field into one folder per non-empty line */
export function parseRestoreRoots(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** Returns what is missing in the form, or null if a token can be created from it */
export function getMcpTokenFormError(form: McpTokenForm): McpTokenFormError | null {
  if (form.name.trim().length === 0) return 'name';
  if (!form.allBackups && form.backupIds.length === 0) return 'backups';
  return null;
}

/**
 * Builds the request for a new token. Restore folders only apply to a token that can restore,
 * and the server refuses them for the other levels, so they are left out there.
 */
export function toCreateMcpTokenRequest(form: McpTokenForm): CreateMcpTokenInputDto {
  return {
    Name: form.name.trim(),
    Level: form.level,
    BackupIds: form.allBackups ? null : [...form.backupIds],
    RestoreRoots: form.level === 'Restore' ? parseRestoreRoots(form.restoreRoots) : [],
    ExpiresIn: form.expiresIn,
  };
}

/** Describes the backups a token can be used with; a backup that no longer exists is shown by its ID */
export function describeMcpTokenBackups(token: McpTokenDto, backupNames: ReadonlyMap<string, string>): string {
  if (token.BackupIds == null) return $localize`All backups`;
  return token.BackupIds.map((id) => backupNames.get(id) ?? $localize`Deleted backup (${id}:id:)`).join(', ');
}

/**
 * The warning to show before the MCP server is turned off. The server deletes every access token
 * when it is turned off, and turning it on again does not bring them back.
 * @param tokenCount The number of access tokens, or null if it is not known
 * @returns The warning, or null if there are no tokens to lose
 */
export function getMcpServerDisableWarning(tokenCount: number | null): string | null {
  if (tokenCount === 0) return null;
  if (tokenCount === null)
    return $localize`Turning off the MCP server deletes all access tokens. The agents using them lose access at once, and turning the server on again does not bring the tokens back.`;
  if (tokenCount === 1)
    return $localize`Turning off the MCP server deletes the access token. The agent using it loses access at once, and turning the server on again does not bring the token back.`;
  return $localize`Turning off the MCP server deletes all ${tokenCount}:count: access tokens. The agents using them lose access at once, and turning the server on again does not bring the tokens back.`;
}

/** The address an agent connects to, given the address the page was loaded from */
export function toMcpEndpointUrl(origin: string): string {
  return origin.replace(/\/+$/, '') + MCP_ENDPOINT_PATH;
}
