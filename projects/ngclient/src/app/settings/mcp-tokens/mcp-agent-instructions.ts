/** The name the Duplicati server gets in the configuration of an agent */
export const MCP_SERVER_NAME = 'duplicati';

export type McpAgentId =
  | 'claude-code'
  | 'claude-desktop'
  | 'vscode'
  | 'cursor'
  | 'codex'
  | 'gemini-cli'
  | 'copilot-cli'
  | 'opencode'
  | 'other';

export type McpAgentInstruction = {
  id: McpAgentId;
  /** Where the snippet goes */
  description: string;
  /** The command or configuration to copy; it holds the token */
  snippet: string;
};

export const MCP_AGENT_OPTIONS: { id: McpAgentId; label: string }[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'vscode', label: 'VS Code (GitHub Copilot)' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'copilot-cli', label: 'GitHub Copilot CLI' },
  { id: 'opencode', label: 'opencode' },
  { id: 'other', label: $localize`Other agent` },
];

/** The name of the server utility, which has the command that bridges a local agent to the MCP endpoint */
export const BRIDGE_COMMAND = 'duplicati-server-util';
export const WINDOWS_BRIDGE_COMMAND = 'Duplicati.CommandLine.ServerUtil.exe';
/** The environment variable the bridge reads the access token from */
export const BRIDGE_TOKEN_VARIABLE = 'DUPLICATI_MCP_TOKEN';

/** The address of the server, given the address of its MCP endpoint */
function toServerUrl(url: string) {
  return url.replace(/\/mcp\/?$/, '');
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

/**
 * Builds what the user needs to give a new access token to each of the common agents.
 * The token is put directly in the snippets, as it cannot be retrieved later.
 * The server utility has a different name on Windows, which matters to the agents that start it as a bridge.
 */
export function getMcpAgentInstructions(url: string, token: string, isWindowsServer: boolean): McpAgentInstruction[] {
  const headers = { Authorization: `Bearer ${token}` };

  return [
    {
      id: 'claude-code',
      description: $localize`Run this command in a terminal.`,
      snippet: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`,
    },
    {
      id: 'claude-desktop',
      description: $localize`Claude Desktop cannot reach a local server directly, so it starts the Duplicati server utility as a bridge. Open Settings, then Developer, choose Edit Config, and add this to claude_desktop_config.json. If Claude Desktop cannot find the command, enter its full path.`,
      snippet: json({
        mcpServers: {
          [MCP_SERVER_NAME]: {
            command: isWindowsServer ? WINDOWS_BRIDGE_COMMAND : BRIDGE_COMMAND,
            args: ['mcp', '--hosturl', toServerUrl(url)],
            env: { [BRIDGE_TOKEN_VARIABLE]: token },
          },
        },
      }),
    },
    {
      id: 'vscode',
      description: $localize`Add this to .vscode/mcp.json in the workspace, or run "MCP: Open User Configuration" and add it there.`,
      snippet: json({ servers: { [MCP_SERVER_NAME]: { type: 'http', url, headers } } }),
    },
    {
      id: 'cursor',
      description: $localize`Add this to ~/.cursor/mcp.json, or to .cursor/mcp.json in the project.`,
      snippet: json({ mcpServers: { [MCP_SERVER_NAME]: { url, headers } } }),
    },
    {
      id: 'codex',
      description: $localize`Add this to ~/.codex/config.toml.`,
      snippet: `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`,
    },
    {
      id: 'gemini-cli',
      description: $localize`Add this to ~/.gemini/settings.json, or to .gemini/settings.json in the project.`,
      snippet: json({ mcpServers: { [MCP_SERVER_NAME]: { httpUrl: url, headers } } }),
    },
    {
      id: 'copilot-cli',
      description: $localize`Add this to ~/.copilot/mcp-config.json.`,
      snippet: json({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url, headers, tools: ['*'] } } }),
    },
    {
      id: 'opencode',
      description: $localize`Add this to opencode.jsonc.`,
      snippet: json({
        $schema: 'https://opencode.ai/config.json',
        mcp: { servers: { [MCP_SERVER_NAME]: { type: 'remote', url, oauth: false, headers } } },
      }),
    },
    {
      id: 'other',
      description: $localize`Add a remote MCP server that uses the Streamable HTTP transport, with this address and this request header.`,
      snippet: `${url}\nAuthorization: Bearer ${token}`,
    },
  ];
}
