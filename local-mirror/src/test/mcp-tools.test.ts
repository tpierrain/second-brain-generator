import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../index.js';
import type { ILocalMirror } from '../domain/local-mirror.js';

// The driving adapter (index.ts) is a 1:1 translation of the API port: each MCP tool
// validates its args, calls the matching port method, and serializes via asText. These
// tests drive the REAL registered surface through an in-memory client (SDK transport
// pair) — so tool names, descriptions, arg mappings, handlers and the asText envelope
// are all exercised end-to-end (mutation: index.ts 2.2 % → hardened).

/** A spy ILocalMirror: records the (method, args) it receives, returns a canned result. */
function spyApi() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string, result: unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };
  const results = {
    setupSource: { setup: 'ok' },
    listSources: [{ name: 'team-a' }],
    sync: { synced: 3 },
    checkFreshness: { behind: false },
    status: { name: 'team-a', items: 7 },
    removeSource: { removed: true },
    healthCheck: { status: 'ok', checks: [] },
  };
  const api = {
    setupSource: record('setupSource', results.setupSource),
    listSources: record('listSources', results.listSources),
    sync: record('sync', results.sync),
    checkFreshness: record('checkFreshness', results.checkFreshness),
    status: record('status', results.status),
    removeSource: record('removeSource', results.removeSource),
    healthCheck: record('healthCheck', results.healthCheck),
  } as unknown as ILocalMirror;
  return { api, calls, results };
}

/** Wire a client to the server over an in-memory transport pair. */
async function connect(api: ILocalMirror, hooks?: Parameters<typeof createMcpServer>[1]) {
  const server = createMcpServer(api, hooks);
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, close: () => client.close() };
}

/** The asText envelope the handlers must produce for a given port result. */
function envelope(result: unknown) {
  return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
}

test('the server advertises its name and version', async () => {
  const { api } = spyApi();
  const { client, close } = await connect(api);

  assert.deepEqual(client.getServerVersion(), { name: 'local-mirror', version: '0.2.0' });

  await close();
});

test('exactly the 7 tools are registered, each with a name and a non-empty description', async () => {
  const { api } = spyApi();
  const { client, close } = await connect(api);

  const { tools } = await client.listTools();
  const byName = new Map(tools.map((t) => [t.name, t]));

  assert.deepEqual(
    [...byName.keys()].sort(),
    ['check_freshness', 'health_check', 'list_sources', 'remove_source', 'setup_source', 'status', 'sync'],
  );
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 0, `${t.name} has a description`);
    // Every input field carries a non-empty description — it is published in the tool's
    // inputSchema and steers how the LLM fills the argument, so it is part of the contract.
    const properties = (t.inputSchema?.properties ?? {}) as Record<string, { description?: string }>;
    for (const [field, schema] of Object.entries(properties)) {
      assert.ok(
        schema.description && schema.description.length > 0,
        `${t.name}.${field} has a description`,
      );
    }
  }

  await close();
});

test('setup_source maps snake_case args to the port request and returns the asText envelope', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({
    name: 'setup_source',
    arguments: {
      name: 'team-a',
      title: 'Team A',
      description: 'roadmap + specs',
      root_page_url: 'https://notion.so/root',
      token_env: 'TEAM_A_TOKEN',
    },
  });

  assert.deepEqual(calls, [
    {
      method: 'setupSource',
      args: [
        {
          name: 'team-a',
          title: 'Team A',
          description: 'roadmap + specs',
          rootPageUrl: 'https://notion.so/root',
          tokenEnv: 'TEAM_A_TOKEN',
        },
      ],
    },
  ]);
  assert.deepEqual(res.content, envelope(results.setupSource));

  await close();
});

test('setup_source fires the onSourceDeclared hook after the port call (arm auto-sync, finding #1)', async () => {
  const { api, calls } = spyApi();
  const declared: string[] = [];
  // The hook records the ordering marker so we can assert it ran AFTER setupSource, not before.
  const { client, close } = await connect(api, {
    onSourceDeclared: async () => void declared.push(`hook@${calls.length}`),
  });

  await client.callTool({
    name: 'setup_source',
    arguments: {
      name: 'team-a',
      title: 'Team A',
      description: 'roadmap + specs',
      root_page_url: 'https://notion.so/root',
      token_env: 'TEAM_A_TOKEN',
    },
  });

  assert.deepEqual(declared, ['hook@1']); // fired exactly once, after setupSource had already run

  await close();
});

test('the onSourceDeclared hook does NOT fire for other tools', async () => {
  const { api } = spyApi();
  let hookCalls = 0;
  const { client, close } = await connect(api, { onSourceDeclared: async () => void (hookCalls += 1) });

  await client.callTool({ name: 'list_sources', arguments: {} });
  await client.callTool({ name: 'sync', arguments: { name: 'team-a' } });
  await client.callTool({ name: 'check_freshness', arguments: { name: 'team-a' } });

  assert.equal(hookCalls, 0); // only setup_source declares a source

  await close();
});

test('list_sources calls the port with no argument', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({ name: 'list_sources', arguments: {} });

  assert.deepEqual(calls, [{ method: 'listSources', args: [] }]);
  assert.deepEqual(res.content, envelope(results.listSources));

  await close();
});

test('sync forwards the source name (incl. the literal "all")', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({ name: 'sync', arguments: { name: 'all' } });

  assert.deepEqual(calls, [{ method: 'sync', args: ['all'] }]);
  assert.deepEqual(res.content, envelope(results.sync));

  await close();
});

test('check_freshness forwards the source name', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({ name: 'check_freshness', arguments: { name: 'team-a' } });

  assert.deepEqual(calls, [{ method: 'checkFreshness', args: ['team-a'] }]);
  assert.deepEqual(res.content, envelope(results.checkFreshness));

  await close();
});

test('status forwards the source name', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({ name: 'status', arguments: { name: 'team-a' } });

  assert.deepEqual(calls, [{ method: 'status', args: ['team-a'] }]);
  assert.deepEqual(res.content, envelope(results.status));

  await close();
});

test('remove_source forwards the name and the optional cleanup flag', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({
    name: 'remove_source',
    arguments: { name: 'team-a', cleanup: true },
  });

  assert.deepEqual(calls, [{ method: 'removeSource', args: ['team-a', true] }]);
  assert.deepEqual(res.content, envelope(results.removeSource));

  await close();
});

test('health_check calls the port with no argument', async () => {
  const { api, calls, results } = spyApi();
  const { client, close } = await connect(api);

  const res = await client.callTool({ name: 'health_check', arguments: {} });

  assert.deepEqual(calls, [{ method: 'healthCheck', args: [] }]);
  assert.deepEqual(res.content, envelope(results.healthCheck));

  await close();
});
