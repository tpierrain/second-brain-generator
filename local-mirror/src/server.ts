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
import { FsSyncLock } from './adapters/fs-sync-lock.js';
import { notionConnectorFactory } from './adapters/notion-gateway.js';
import { VAULT_DIR, SIDECAR_DIR, CONFIG_PATH } from './lib/config.js';
import { resolveSyncIntervalSeconds } from './lib/sync-interval.js';
import { AutoSyncSupervisor } from './auto-sync-supervisor.js';

/** Wire the real driven adapters — the ONE place bound to the concrete fs/Notion SPI. */
export function buildDeps(): LocalMirrorDeps {
  return {
    configStore: new FsConfigStore(CONFIG_PATH),
    stateStore: new FsStateStore(SIDECAR_DIR),
    vaultWriter: new FsVaultWriter(VAULT_DIR),
    clock: new SystemClock(),
    connectorFor: notionConnectorFactory,
    syncLock: new FsSyncLock({ sidecarDir: SIDECAR_DIR }),
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

/**
 * The real entry path: build ONE shared Domain Service, wire the auto-sync supervisor over that SAME
 * instance (so its single-flight lock coordinates the timer with the interactive tools), connect the
 * tool surface with a `setup_source` hook that lets a first mirror declared mid-session arm the
 * supervisor (Step 4 finding #1), attempt the boot-time arm, then stop it cleanly on shutdown so no
 * orphan timer outlives the session. Integration-only, like the guard below — it drives real stdio
 * and process signals, so it runs when server.ts IS the process, not under the unit suite. Its parts
 * (buildApi, boot, AutoSyncSupervisor, resolveSyncIntervalSeconds) are each unit-tested.
 */
export async function bootReal(): Promise<void> {
  const api = buildApi();
  const supervisor = new AutoSyncSupervisor({
    api,
    intervalSeconds: resolveSyncIntervalSeconds(process.env.LOCAL_MIRROR_SYNC_INTERVAL),
    log: console.error,
  });
  await boot({
    createServer: () =>
      createMcpServer(api, { onSourceDeclared: () => armAfterSetup(supervisor) }),
    createTransport: createRealTransport,
    log: console.error,
  });
  await supervisor.ensureRunning();
  installShutdown(supervisor);
}

/** Fail-soft arm after a setup_source: a supervisor hiccup must never break the tool response. */
async function armAfterSetup(supervisor: AutoSyncSupervisor): Promise<void> {
  try {
    await supervisor.ensureRunning();
  } catch (error) {
    console.error(`[local-mirror] auto-sync could not arm after setup: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Injectable seams for the shutdown wiring, so the signal/EOF handling is unit-testable. */
export interface ShutdownHooks {
  onSignal: (signal: NodeJS.Signals, handler: () => void) => void;
  onStdinEnd: (handler: () => void) => void;
  exit: (code: number) => void;
}

/** The real shutdown wiring: process signals, stdin EOF/close, and process.exit. */
const realShutdownHooks: ShutdownHooks = {
  onSignal: (signal, handler) => {
    process.once(signal, handler);
  },
  onStdinEnd: (handler) => {
    process.stdin.once('end', handler);
    process.stdin.once('close', handler);
  },
  exit: (code) => process.exit(code),
};

/**
 * Stop the supervisor cleanly when the session ends — no orphan timer. On stdin EOF/close the
 * session ended on its own, so we only cancel the tick and let the process wind down naturally.
 * On a SIGNAL we must ALSO terminate: registering a SIGINT/SIGTERM listener overrides Node's
 * default terminate-on-signal, so without an explicit exit here Ctrl-C / SIGTERM would merely
 * cancel the scheduler and leave an orphaned server holding stdio. Exit code = 128 + signal number.
 */
export function installShutdown(
  supervisor: Pick<AutoSyncSupervisor, 'stop'>,
  hooks: ShutdownHooks = realShutdownHooks,
): void {
  hooks.onStdinEnd(() => supervisor.stop());
  hooks.onSignal('SIGINT', () => {
    supervisor.stop();
    hooks.exit(130);
  });
  hooks.onSignal('SIGTERM', () => {
    supervisor.stop();
    hooks.exit(143);
  });
}

// Boot only when run as the entry point — importing for tests stays side-effect-free.
// This guard (and the boot invocation it wraps) is the sole integration-only line: it is
// exercised when server.ts IS the process, not under the unit suite.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootReal().catch(fatal);
}
