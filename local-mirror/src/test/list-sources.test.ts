import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionLocalMirror } from './builder.js';

// Acceptance test at the API port (ILocalMirror), driven by the Builder with
// stubbed SPI — NOT through the MCP transport (the MCP server is a thin adapter,
// tested separately). See PRD §15.
test('a brand-new local-mirror declares no sources', async () => {
  const gss = aLocalMirror().build();

  const sources = await gss.listSources();

  assert.deepEqual(sources, []);
});

test('a declared but never-synced source is listed with empty state', async () => {
  const gss = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror({ name: 'team-b', title: 'Team B' }))
    .build();

  const sources = await gss.listSources();

  assert.deepEqual(sources, [
    {
      name: 'team-b',
      title: 'Team B',
      connector: 'notion',
      watermark: null,
      lastSyncAt: null,
      lastSyncStatus: 'never',
      itemCount: 0,
    },
  ]);
});
