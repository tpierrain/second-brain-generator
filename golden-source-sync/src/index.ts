// MCP server = the driving adapter (PRD §5). It is a 1:1 translation of the API port
// IGoldenSourceSync: each tool validates its arguments (zod), calls the matching port
// method, and serializes the result. NO business logic lives here — that is what makes
// "where to deploy" (local / remote / plugin) a packaging variable (PRD §4).
//
// The composition root (real FS/Notion adapters) and the stdio transport boot land in
// Step 8 (Integration); this module exposes the tool surface against an injected port.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IGoldenSourceSync } from './domain/golden-source-sync.js';

const SERVER_NAME = 'golden-source-sync';

/** Serialize any port result into the MCP text-content envelope. */
function asText(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/** Declare the 6 tools (PRD §9), each a thin 1:1 wrapper over the API port. */
export function createMcpServer(api: IGoldenSourceSync): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' });

  server.tool(
    'setup_source',
    'Interactive onboarding of a golden source: tests the connection/scope, does the first sync, explains each step. The token travels via an env var, never through this tool.',
    {
      name: z.string().describe('Short technical id = vault subfolder name (e.g. pa-sc)'),
      title: z.string().describe('Human label'),
      description: z.string().describe('Natural-language topics covered (routing key)'),
      root_page_url: z.string().describe('Root Notion page URL of the zone'),
      token_env: z.string().describe('Name of the env var holding the integration token'),
    },
    async ({ name, title, description, root_page_url, token_env }) =>
      asText(
        await api.setupSource({ name, title, description, rootPageUrl: root_page_url, tokenEnv: token_env }),
      ),
  );

  server.tool('list_sources', 'Lists the declared golden sources and their state.', {}, async () =>
    asText(await api.listSources()),
  );

  server.tool(
    'sync',
    'Synchronizes the delta and reconciles deletions for one source (name) or all ("all"). Returns what changed.',
    { name: z.string().describe('A source name, or the literal "all"') },
    async ({ name }) => asText(await api.sync(name)),
  );

  server.tool(
    'check_freshness',
    'Light watermark-only check: is the source behind, and by how much? Pulls nothing.',
    { name: z.string().describe('Source name') },
    async ({ name }) => asText(await api.checkFreshness(name)),
  );

  server.tool(
    'status',
    "A source's state: last sync, watermark, item count, lateness.",
    { name: z.string().describe('Source name') },
    async ({ name }) => asText(await api.status(name)),
  );

  server.tool(
    'remove_source',
    'De-registers a source, optionally cleaning up its folder and sidecar state.',
    {
      name: z.string().describe('Source name'),
      cleanup: z.boolean().optional().describe('Also delete the folder + sidecar (default: false)'),
    },
    async ({ name, cleanup }) => asText(await api.removeSource(name, cleanup)),
  );

  return server;
}
