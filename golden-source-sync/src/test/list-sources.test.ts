import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aGoldenSourceSync, aNotionGoldenSource } from './builder.js';

// Acceptance test at the API port (IGoldenSourceSync), driven by the Builder with
// stubbed SPI — NOT through the MCP transport (the MCP server is a thin adapter,
// tested separately). See PRD §15.
test('a brand-new golden-source-sync declares no sources', async () => {
  const gss = aGoldenSourceSync().build();

  const sources = await gss.listSources();

  assert.deepEqual(sources, []);
});

test('a declared but never-synced source is listed with empty state', async () => {
  const gss = aGoldenSourceSync()
    .withDeclaredSources(aNotionGoldenSource({ name: 'comex', title: 'COMEX' }))
    .build();

  const sources = await gss.listSources();

  assert.deepEqual(sources, [
    {
      name: 'comex',
      title: 'COMEX',
      connector: 'notion',
      watermark: null,
      lastSyncAt: null,
      lastSyncStatus: 'never',
      itemCount: 0,
    },
  ]);
});
