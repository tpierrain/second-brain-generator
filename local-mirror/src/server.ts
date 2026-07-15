// Composition root + stdio boot for the `local-mirror` MCP server.
//
// This is the ONLY place that knows about concrete adapters: it wires the real
// filesystem + Notion SPI implementations into the Domain Service, then exposes
// the tool surface (createMcpServer, see index.ts) over a stdio transport. Keeping
// the boot here — and OUT of index.ts — means the tool surface stays unit-testable
// against an injected port, while "where to deploy" remains a packaging variable
// (PRD §4/§5). The .mcp.json entry points at THIS file.
//
// The wiring seams (buildDeps / buildApi / boot / fatal) are exported and unit-tested
// (server-boot.test.ts); only the top-level `bootReal().catch(fatal)` invocation runs
// solely when this file IS the process entry point (import.meta.url guard) — so an
// import for testing stays side-effect-free.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fileURLToPath } from 'node:url';
import { createMcpServer } from './index.js';
import { LocalMirror, type LocalMirrorDeps } from './domain/local-mirror.js';
import { FsConfigStore } from './adapters/fs-config-store.js';
import { FsStateStore } from './adapters/fs-state-store.js';
import { FsVaultWriter } from './adapters/fs-vault-writer.js';
import { SystemClock } from './adapters/system-clock.js';
import { notionConnectorFactory } from './adapters/notion-gateway.js';
import { VAULT_DIR, SIDECAR_DIR, CONFIG_PATH } from './lib/config.js';

/** Wire the real driven adapters — the ONE place bound to the concrete fs/Notion SPI. */
export function buildDeps(): LocalMirrorDeps {
  return {
    configStore: new FsConfigStore(CONFIG_PATH),
    stateStore: new FsStateStore(SIDECAR_DIR),
    vaultWriter: new FsVaultWriter(VAULT_DIR),
    clock: new SystemClock(),
    connectorFor: notionConnectorFactory,
  };
}

/** Assemble the Domain Service from its driven dependencies (real ones by default). */
export function buildApi(deps: LocalMirrorDeps = buildDeps()): LocalMirror {
  return new LocalMirror(deps);
}

/** The minimal server contract boot() drives — lets the transport wiring be stubbed. */
export interface BootServer {
  connect(transport: unknown): Promise<void>;
}

/** Everything boot() needs, injected so the glue is exercisable without real stdio. */
export interface BootDeps {
  createServer(): BootServer;
  createTransport(): unknown;
  log(message: string): void;
}

/** Boot glue: connect the tool surface over a transport, then announce readiness. */
export async function boot(deps: BootDeps): Promise<void> {
  const server = deps.createServer();
  await server.connect(deps.createTransport());
  deps.log('[local-mirror] MCP server running on stdio');
}

/** Fatal handler for the top-level boot: report the error and exit non-zero. */
export function fatal(
  err: unknown,
  log: (message: string, err: unknown) => void = console.error,
  exit: (code: number) => void = process.exit,
): void {
  log('[local-mirror] Fatal:', err);
  exit(1);
}

/** The real tool surface, wired to the real driven adapters. */
export function createRealServer(): McpServer {
  return createMcpServer(buildApi());
}

/** The real stdio transport (connected by boot(), not here). */
export function createRealTransport(): StdioServerTransport {
  return new StdioServerTransport();
}

/** Named factories so the real wiring is inspectable (no un-mutable inline arrows). */
export const realBootDeps: BootDeps = {
  createServer: createRealServer,
  createTransport: createRealTransport,
  log: console.error,
};

// Boot only when run as the entry point — importing for tests stays side-effect-free.
// This guard (and the boot invocation it wraps) is the sole integration-only line: it is
// exercised when server.ts IS the process, not under the unit suite.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  boot(realBootDeps).catch(fatal);
}
