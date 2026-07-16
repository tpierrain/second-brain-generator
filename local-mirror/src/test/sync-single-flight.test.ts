import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionPage } from './builder.js';

// Acceptance at the API port (ILocalMirror). Two brain windows can be open on the same brain,
// each with its own MCP process and its own auto-refresh timer, sharing one on-disk state.json.
// A single-flight lock per source makes the second one SKIP rather than race (last-write-wins
// would corrupt the sidecar). A skipped sync writes nothing and never touches the state.
test('a source already being synced by another window is skipped, not raced', async () => {
  const harness = aLocalMirror()
    .withNotionPages(aNotionPage({ id: 'page-1', content: 'First.\n' }))
    .withSourceBeingSyncedByAnotherWindow('team-a');
  const gss = harness.build();

  const report = await gss.sync('team-a');

  assert.equal(report.status, 'skipped');
  assert.equal(report.written, 0);
  assert.equal(harness.vaultFiles().size, 0); // nothing written to the vault
  const [source] = await gss.listSources();
  assert.equal(source.lastSyncStatus, 'never'); // state.json untouched — no race
  assert.equal(source.watermark, null);
});
