import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionPage } from './builder.js';

// Acceptance tests at the API port (ILocalMirror). `check_freshness` (PRD §8/§9) is a
// LIGHT watermark-only check: it enumerates the perimeter (metadata, no content fetched) to get
// the remote max last_edited_time and compares it to the local watermark. It pulls no content
// and writes nothing — it just answers "behind? by how much?".

test('a source with no upstream change is not behind', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-12T14:21:00.000Z' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, false);
  assert.equal(fr.localWatermark, '2026-06-12T14:21:00.000Z');
  assert.equal(fr.remoteWatermark, '2026-06-12T14:21:00.000Z');
});

test('a source whose upstream got a newer edit is behind', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-12T14:21:00.000Z' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withRevisedPage(aNotionPage({ id: 'p1', lastEditedTime: '2026-06-15T10:00:00.000Z' }));
  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, true);
  assert.equal(fr.localWatermark, '2026-06-12T14:21:00.000Z');
  assert.equal(fr.remoteWatermark, '2026-06-15T10:00:00.000Z');
});

test('a never-synced source is behind as soon as the perimeter has any page', async () => {
  const gss = aLocalMirror()
    .withNotionPages(aNotionPage({ id: 'p1', lastEditedTime: '2026-06-12T14:21:00.000Z' }))
    .build();

  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, true);
  assert.equal(fr.localWatermark, null);
  assert.equal(fr.remoteWatermark, '2026-06-12T14:21:00.000Z');
});

test('check_freshness of an unknown source rejects with a clear message', async () => {
  const gss = aLocalMirror().build();

  await assert.rejects(() => gss.checkFreshness('nope'), /unknown.*nope/i);
});
