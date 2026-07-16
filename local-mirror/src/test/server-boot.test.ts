import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  buildDeps,
  buildApi,
  boot,
  fatal,
  createRealServer,
  createRealTransport,
  realBootDeps,
  installShutdown,
  type BootServer,
  type ShutdownHooks,
} from '../server.js';
import { LocalMirror } from '../domain/local-mirror.js';
import { FsConfigStore } from '../adapters/fs-config-store.js';
import { FsStateStore } from '../adapters/fs-state-store.js';
import { FsVaultWriter } from '../adapters/fs-vault-writer.js';
import { SystemClock } from '../adapters/system-clock.js';
import { notionConnectorFactory } from '../adapters/notion-gateway.js';

// The composition root (server.ts) is boot glue, so its seams are extracted and exported:
// buildDeps wires the real driven adapters, buildApi assembles the Domain Service,
// createRealServer/createRealTransport/realBootDeps name the real wiring, boot() connects
// the tool surface over a transport, fatal() reports + exits. Mutation: 0 % → 85.71 %
// (10 killed + 2 timeout / 14). The 2 residual survivors are documented equivalents — the
// `if (process.argv[1] === fileURLToPath(import.meta.url))` entry-point guard and its
// `boot(realBootDeps).catch(fatal)` body: they run ONLY when server.ts IS the process, so
// they are integration-only (the real stdio connect can't run under the unit suite without
// hanging). Effective 12/12 = 100 % on non-equivalents.

test('buildDeps wires each driven adapter to its concrete implementation', () => {
  const deps = buildDeps();

  assert.ok(deps.configStore instanceof FsConfigStore);
  assert.ok(deps.stateStore instanceof FsStateStore);
  assert.ok(deps.vaultWriter instanceof FsVaultWriter);
  assert.ok(deps.clock instanceof SystemClock);
  assert.equal(deps.connectorFor, notionConnectorFactory);
});

test('buildApi assembles the Domain Service from the (defaulted) real deps', () => {
  const api = buildApi();

  assert.ok(api instanceof LocalMirror);
});

test('boot connects the tool surface over the transport, then announces readiness', async () => {
  const transport = { sentinel: true };
  let connectedTo: unknown;
  const server: BootServer = {
    async connect(t) {
      connectedTo = t;
    },
  };
  const logged: string[] = [];

  await boot({
    createServer: () => server,
    createTransport: () => transport,
    log: (message) => logged.push(message),
  });

  assert.equal(connectedTo, transport);
  assert.deepEqual(logged, ['[local-mirror] MCP server running on stdio']);
});

test('fatal reports the error and exits non-zero', () => {
  const boom = new Error('stdio gone');
  const logCalls: Array<[string, unknown]> = [];
  const exitCodes: number[] = [];

  fatal(
    boom,
    (message, err) => logCalls.push([message, err]),
    (code) => exitCodes.push(code),
  );

  assert.deepEqual(logCalls, [['[local-mirror] Fatal:', boom]]);
  assert.deepEqual(exitCodes, [1]);
});

test('createRealServer builds the real tool surface', () => {
  assert.ok(createRealServer() instanceof McpServer);
});

test('createRealTransport builds the real stdio transport', () => {
  assert.ok(createRealTransport() instanceof StdioServerTransport);
});

test('realBootDeps wires the named real factories (not inline arrows)', () => {
  assert.equal(realBootDeps.createServer, createRealServer);
  assert.equal(realBootDeps.createTransport, createRealTransport);
  assert.equal(realBootDeps.log, console.error);
});

// installShutdown must not just cancel the timer on a signal: adding a SIGINT/SIGTERM listener
// overrides Node's default terminate-on-signal, so it MUST also exit — otherwise Ctrl-C / SIGTERM
// would leave an orphaned server holding stdio (regression the auto-sync wiring introduced).
function fakeHooks() {
  const signals = new Map<NodeJS.Signals, () => void>();
  const stdinHandlers: Array<() => void> = [];
  const exits: number[] = [];
  const hooks: ShutdownHooks = {
    onSignal: (signal, handler) => signals.set(signal, handler),
    onStdinEnd: (handler) => stdinHandlers.push(handler),
    exit: (code) => exits.push(code),
  };
  return { hooks, signals, stdinHandlers, exits };
}

test('installShutdown: SIGINT stops the scheduler AND terminates the process (130)', () => {
  const { hooks, signals, exits } = fakeHooks();
  const stops: string[] = [];
  installShutdown({ stop: () => stops.push('stop') }, hooks);

  signals.get('SIGINT')!();

  assert.deepEqual(stops, ['stop']);
  assert.deepEqual(exits, [130]);
});

test('installShutdown: SIGTERM stops the scheduler AND terminates the process (143)', () => {
  const { hooks, signals, exits } = fakeHooks();
  const stops: string[] = [];
  installShutdown({ stop: () => stops.push('stop') }, hooks);

  signals.get('SIGTERM')!();

  assert.deepEqual(stops, ['stop']);
  assert.deepEqual(exits, [143]);
});

test('installShutdown: stdin end/close stops the scheduler but does NOT force-exit', () => {
  const { hooks, stdinHandlers, exits } = fakeHooks();
  const stops: string[] = [];
  installShutdown({ stop: () => stops.push('stop') }, hooks);

  assert.ok(stdinHandlers.length >= 1);
  for (const h of stdinHandlers) h();

  assert.equal(stops.length, stdinHandlers.length);
  assert.deepEqual(exits, []); // natural EOF winds down on its own — no forced exit
});
