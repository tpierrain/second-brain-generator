// MCP server = the driving adapter (PRD §5). It is a 1:1 translation of the API port
// ILocalMirror: each tool validates its arguments (zod), calls the matching port
// method, and serializes the result. NO business logic lives here — that is what makes
// "where to deploy" (local / remote / plugin) a packaging variable (PRD §4).
//
// The composition root (real FS/Notion adapters) and the stdio transport boot land in
// Step 8 (Integration); this module exposes the tool surface against an injected port.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ILocalMirror } from './domain/local-mirror.js';

const SERVER_NAME = 'local-mirror';

/** Optional lifecycle hooks the boot wires in — kept out of the port so the tool surface stays 1:1. */
export interface McpServerHooks {
  /**
   * Fired after a `setup_source` call resolves, so the composition root can arm the background
   * auto-refresh that boot left idle when no mirror was declared yet (Step 4 finding #1). Fail-soft:
   * a throw here must not break the tool response, so the boot's hook swallows its own errors.
   */
  onSourceDeclared?: () => void | Promise<void>;
}

/** Serialize any port result into the MCP text-content envelope. */
function asText(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

/** Declare the 7 tools (PRD §9), each a thin 1:1 wrapper over the API port. */
export function createMcpServer(api: ILocalMirror, hooks: McpServerHooks = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: '0.2.0' });

  server.tool(
    'setup_source',
    'Interactive onboarding of a local mirror: tests the connection/scope, does the first sync, explains each step. The token travels via an env var, never through this tool.',
    {
      name: z.string().describe('Short technical id = vault subfolder name (e.g. team-a)'),
      title: z.string().describe('Human label'),
      description: z.string().describe('Natural-language topics covered (routing key)'),
      root_page_url: z.string().describe('Root Notion page URL of the zone'),
      token_env: z.string().describe('Name of the env var holding the integration token'),
    },
    async ({ name, title, description, root_page_url, token_env }) => {
      const result = await api.setupSource({ name, title, description, rootPageUrl: root_page_url, tokenEnv: token_env });
      // A source may now be declared → let the boot (re-)arm auto-sync if it was idle. After the
      // port call so listSources sees the upserted config; unconditional because setupSource can
      // persist a source even on a first-sync failure (ok:false), and the boot re-checks anyway.
      await hooks.onSourceDeclared?.();
      return asText(result);
    },
  );

  server.tool('list_sources', 'Lists the declared local mirrors and their state.', {}, async () =>
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

  server.tool(
    'health_check',
    'Reports whether this OPTIONAL Notion mirror is operational (config readable, mirror store reachable). Pulls nothing. Returns a JSON { status, checks[] } verdict; nothing configured → unknown, never broken (ADR 0030).',
    {},
    async () => asText(await api.healthCheck()),
  );

  return server;
}
