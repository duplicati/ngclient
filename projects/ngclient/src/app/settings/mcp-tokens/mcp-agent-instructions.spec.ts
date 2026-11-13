import { describe, expect, it } from 'vitest';
import { getMcpAgentInstructions, MCP_AGENT_OPTIONS } from './mcp-agent-instructions';

const URL = 'http://localhost:8200/mcp';
const TOKEN = 'aaa.bbb.ccc';

describe('MCP agent instructions', () => {
  const instructions = getMcpAgentInstructions(URL, TOKEN, false);
  const snippet = (id: string) => instructions.find((x) => x.id === id)!.snippet;

  it('has instructions for every agent that can be picked', () => {
    expect(instructions.map((x) => x.id)).toEqual(MCP_AGENT_OPTIONS.map((x) => x.id));
  });

  // Claude Desktop is given the bridge command, which takes the server address and reads the token from its environment
  it.each(MCP_AGENT_OPTIONS.map((x) => x.id).filter((x) => x !== 'claude-desktop'))(
    'puts the address and the token in the %s snippet',
    (id) => {
      expect(snippet(id)).toContain(URL);
      expect(snippet(id)).toContain(`Bearer ${TOKEN}`);
    }
  );

  it('builds the Claude Code command', () => {
    expect(snippet('claude-code')).toBe(
      `claude mcp add --transport http duplicati ${URL} --header "Authorization: Bearer ${TOKEN}"`
    );
  });

  it.each([
    [false, 'duplicati-server-util'],
    [true, 'Duplicati.CommandLine.ServerUtil.exe'],
  ])('starts the bridge for Claude Desktop (Windows server: %s)', (isWindowsServer, command) => {
    const claudeDesktop = getMcpAgentInstructions(URL, TOKEN, isWindowsServer).find((x) => x.id === 'claude-desktop')!;
    expect(JSON.parse(claudeDesktop.snippet)).toEqual({
      mcpServers: {
        duplicati: {
          command,
          args: ['mcp', '--hosturl', 'http://localhost:8200'],
          env: { DUPLICATI_MCP_TOKEN: TOKEN },
        },
      },
    });
  });

  it('builds the Codex configuration', () => {
    expect(snippet('codex')).toBe(
      `[mcp_servers.duplicati]\nurl = "${URL}"\nhttp_headers = { "Authorization" = "Bearer ${TOKEN}" }`
    );
  });

  it.each([
    ['vscode', { servers: { duplicati: { type: 'http', url: URL, headers: { Authorization: `Bearer ${TOKEN}` } } } }],
    ['cursor', { mcpServers: { duplicati: { url: URL, headers: { Authorization: `Bearer ${TOKEN}` } } } }],
    ['gemini-cli', { mcpServers: { duplicati: { httpUrl: URL, headers: { Authorization: `Bearer ${TOKEN}` } } } }],
    [
      'copilot-cli',
      {
        mcpServers: {
          duplicati: { type: 'http', url: URL, headers: { Authorization: `Bearer ${TOKEN}` }, tools: ['*'] },
        },
      },
    ],
    [
      'opencode',
      {
        $schema: 'https://opencode.ai/config.json',
        mcp: {
          servers: {
            duplicati: { type: 'remote', url: URL, oauth: false, headers: { Authorization: `Bearer ${TOKEN}` } },
          },
        },
      },
    ],
  ])('builds valid JSON for %s', (id, expected) => {
    expect(JSON.parse(snippet(id))).toEqual(expected);
  });
});
