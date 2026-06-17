import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aGoldenSourceSync, anUnreadableNotionPage, aNotionPage } from './builder.js';

// Acceptance tests at the API port (IGoldenSourceSync). Step 3 turns the dumb "rewrite
// everything" sync into a stateful delta: the per-source state sidecar remembers the hash
// of the produced markdown, so a second sync with nothing changed upstream rewrites NOTHING
// (no noise commit/reindex — PRD §10), and the watermark advances to the max of the
// perimeter (PRD §7/§16) on full success.
test('a second sync with no upstream change rewrites nothing', async () => {
  const harness = aGoldenSourceSync().withNotionPages(
    aNotionPage({ id: 'page-1', content: 'First.\n' }),
    aNotionPage({ id: 'page-2', content: 'Second.\n' }),
  );
  const gss = harness.build();
  await gss.sync('pa-sc');

  const second = await gss.sync('pa-sc');

  assert.equal(second.written, 0);
  assert.equal(second.unchanged, 2);
});

test('a successful sync advances the watermark to the max last_edited_time of the perimeter', async () => {
  const harness = aGoldenSourceSync().withNotionPages(
    aNotionPage({ id: 'page-1', lastEditedTime: '2026-06-10T08:00:00.000Z' }),
    aNotionPage({ id: 'page-2', lastEditedTime: '2026-06-15T09:32:00.000Z' }),
  );
  const gss = harness.build();

  await gss.sync('pa-sc');

  const [source] = await gss.listSources();
  assert.equal(source.watermark, '2026-06-15T09:32:00.000Z');
  assert.equal(source.lastSyncStatus, 'ok');
  assert.equal(source.itemCount, 2);
});

test('a partial sync (an item fails to fetch) keeps the readable file but freezes the watermark', async () => {
  const harness = aGoldenSourceSync().withNotionPages(
    aNotionPage({ id: 'page-1', lastEditedTime: '2026-06-10T08:00:00.000Z', content: 'ok\n' }),
    anUnreadableNotionPage({ id: 'page-2', lastEditedTime: '2026-06-15T09:32:00.000Z' }),
  );
  const gss = harness.build();

  const report = await gss.sync('pa-sc');

  assert.equal(report.status, 'partial');
  assert.equal(report.written, 1);
  assert.ok(harness.vaultFiles().has('golden-sources/pa-sc/page-1.md'));
  const [source] = await gss.listSources();
  assert.equal(source.watermark, null); // never advanced past a failed perimeter
  assert.equal(source.lastSyncStatus, 'partial');
});
