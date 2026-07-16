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

test('a same-minute edit made after the sync is caught once that minute has elapsed', async () => {
  // Notion stamps last_edited_time at MINUTE granularity. When a sync lands in the same minute as
  // the latest edit, a further edit within that same minute leaves last_edited_time unchanged — so a
  // strict watermark `>` would miss it forever. Once the minute has elapsed we must report `behind`
  // for one corrective re-sync (whose content hash then picks up the missed edit).
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-17T00:00:00.000Z', content: 'draft' }),
  );
  const gss = harness.build(); // clock at 2026-06-17T00:00:00 → synced within the watermark's minute
  await gss.sync('team-a');

  harness.withRevisedPage(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-17T00:00:00.000Z', content: 'draft finished' }),
  );
  harness.advanceClockTo('2026-06-17T00:01:30.000Z');
  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, true);
  assert.equal(fr.localWatermark, '2026-06-17T00:00:00.000Z');
  assert.equal(fr.remoteWatermark, '2026-06-17T00:00:00.000Z');
});

test('a source synced within the current minute is not yet behind (no mid-minute churn)', async () => {
  // While still inside the watermark's own minute, more same-minute edits may still land — we wait
  // for the minute to close so one corrective sync catches them all, rather than re-syncing on each tick.
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-17T00:00:00.000Z', content: 'draft' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withRevisedPage(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-17T00:00:00.000Z', content: 'still typing' }),
  );
  harness.advanceClockTo('2026-06-17T00:00:45.000Z'); // same minute, not elapsed yet
  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, false);
});

test('a corrective sync in a later minute clears the provisional flag (no re-sync loop)', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-17T00:00:00.000Z', content: 'draft' }),
  );
  const gss = harness.build();
  await gss.sync('team-a'); // provisional: synced within the watermark's minute

  harness.advanceClockTo('2026-06-17T00:01:30.000Z');
  await gss.sync('team-a'); // corrective sync — its lastSyncAt now falls in a later minute
  harness.advanceClockTo('2026-06-17T00:02:10.000Z');
  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, false);
});

test('check_freshness of an unknown source rejects with a clear message', async () => {
  const gss = aLocalMirror().build();

  await assert.rejects(() => gss.checkFreshness('nope'), /unknown.*nope/i);
});
