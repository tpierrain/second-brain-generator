import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aGoldenSourceSync, aNotionPage } from './builder.js';

// Acceptance tests at the API port (IGoldenSourceSync). `status` (PRD §9) reports a single
// source's state — last sync, watermark, item count, lateness — without pulling anything.

test('status of a synced source reports watermark, item count and last sync status', async () => {
  const harness = aGoldenSourceSync().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-12T14:21:00.000Z' }),
    aNotionPage({ id: 'p2', lastEditedTime: '2026-06-13T09:00:00.000Z' }),
  );
  const gss = harness.build();
  await gss.sync('pa-sc');

  const status = await gss.status('pa-sc');

  assert.equal(status.name, 'pa-sc');
  assert.equal(status.itemCount, 2);
  assert.equal(status.watermark, '2026-06-13T09:00:00.000Z');
  assert.equal(status.lastSyncStatus, 'ok');
});

test('status of a never-synced declared source reports the "never" state', async () => {
  const gss = aGoldenSourceSync().withNotionPages(aNotionPage()).build();

  const status = await gss.status('pa-sc');

  assert.equal(status.lastSyncStatus, 'never');
  assert.equal(status.watermark, null);
  assert.equal(status.itemCount, 0);
});

test('status of an unknown source rejects with a clear message', async () => {
  const gss = aGoldenSourceSync().build();

  await assert.rejects(() => gss.status('nope'), /unknown.*nope/i);
});
