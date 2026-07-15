// @ts-nocheck
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aLocalMirror,
  aNotionPage,
  anUnreadableNotionPage,
  aNotionLocalMirror,
} from './builder.js';

// Acceptance tests at the API port (ILocalMirror) covering the sync/freshness EDGE branches the
// happy-path suites don't reach: an unknown source, an empty perimeter with no prior state (which
// must NOT trip the wholesale-vanish guard), the per-item write-error persistence rules, the
// frozen watermark on a partial run, the fan-out over rejecting sources, and freshness with an
// empty remote perimeter.
//
// Documented EQUIVALENT mutants on local-mirror.ts (effective 100% on non-equivalents):
//   - L110 `ok: report.status !== 'failed'` → `ok: true` / `ok: … !== ""` (×2): once setupSource
//     has proven the scope and upsert-ed the config, the immediately-following sync of THAT config
//     can never return 'failed' (that status only arises for an unknown source), so the guard's
//     false branch is unreachable and the mutants are behaviour-identical.
//   - L388 `if (sources.length === 0) return 'ok'` → `if (false)`: the guard is a shortcut for
//     `every([]) === true` which already returns 'ok', so removing it changes nothing.
//   - L398 `item.lastEditedTime > max` → `>= max`: on an equal value both assign the same string,
//     so the computed max is identical.

// sync of an unknown source is a clean failed report (not a throw, not a partial write).
test('syncing an unknown source returns a fully-zeroed failed report', async () => {
  const gss = aLocalMirror().withDeclaredSources(aNotionLocalMirror()).build();

  const report = await gss.sync('does-not-exist');

  assert.deepEqual(report, {
    name: 'does-not-exist',
    status: 'failed',
    written: 0,
    deleted: 0,
    unchanged: 0,
  });
});

// The wholesale-vanish guard (§7/§12) freezes ONLY when a non-empty corpus goes to zero. A
// genuinely empty first sync (no prior state) must stay `ok`, not be mistaken for a lost scope.
test('an empty perimeter on a never-synced source is a clean ok sync, not a frozen partial', async () => {
  const gss = aLocalMirror().withDeclaredSources(aNotionLocalMirror()).build();

  const report = await gss.sync('team-a');

  assert.equal(report.status, 'ok');
  assert.equal(report.written, 0);
  assert.equal(report.deleted, 0);
});

// Write-error persistence, case NEW item: an untracked page that fails to fetch/write is NOT
// recorded in the state map (there is no prior version to keep) — itemCount excludes it.
test('a NEW page that fails to fetch is left out of the state map (nothing to keep)', async () => {
  const harness = aLocalMirror().withNotionPages(anUnreadableNotionPage({ id: 'p1' }));
  const gss = harness.build();

  const report = await gss.sync('team-a');

  assert.equal(report.status, 'partial');
  assert.equal(report.written, 0);
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 0);
});

// Write-error persistence, case TRACKED item: a page that synced before but now fails to fetch
// KEEPS its last-good tracked entry (incremental persistence) — itemCount stays, run is partial.
test('a TRACKED page that later fails to fetch keeps its last-good state entry', async () => {
  const harness = aLocalMirror().withNotionPages(aNotionPage({ id: 'p1', content: 'good\n' }));
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withRevisedPage(anUnreadableNotionPage({ id: 'p1' }));
  const report = await gss.sync('team-a');

  assert.equal(report.status, 'partial');
  assert.equal(report.written, 0);
  assert.ok(harness.vaultFiles().has('mirrors/team-a/p1.md'), 'the last-good .md stays on disk');
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 1, 'the tracked page is kept, not dropped');
});

// On a partial run the watermark FREEZES at the prior value — it is not reset to null. This pins
// the `?? null` fallback (keep the prior watermark) against a `&& null` (would wipe it).
test('a partial sync freezes the watermark at the prior value, never nulling it', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1', lastEditedTime: '2026-06-10T08:00:00.000Z', content: 'good\n' }),
  );
  const gss = harness.build();
  await gss.sync('team-a'); // watermark advances to 2026-06-10T08:00

  harness.withRevisedPage(anUnreadableNotionPage({ id: 'p1' }));
  await gss.sync('team-a'); // now partial

  const [source] = await gss.listSources();
  assert.equal(source.watermark, '2026-06-10T08:00:00.000Z');
  assert.equal(source.lastSyncStatus, 'partial');
});

// sync("all") over sources whose sidecar store is unreachable: every source rejects, so the
// fan-out reports each as a failed entry (never a bare undefined) and the aggregate is failed.
test('sync("all") reports every rejecting source as a failed entry', async () => {
  const gss = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror({ name: 'a' }), aNotionLocalMirror({ name: 'b' }))
    .withUnreachableStore()
    .build();

  const report = await gss.sync('all');

  assert.equal(report.status, 'failed');
  assert.equal((report.sources ?? []).length, 2);
  assert.ok((report.sources ?? []).every((r) => r.status === 'failed'));
});

// check_freshness with an EMPTY remote perimeter and no local watermark is NOT behind: there is
// simply nothing upstream. This pins the `remoteWatermark !== null` guard.
test('check_freshness with an empty remote perimeter is not behind', async () => {
  const gss = aLocalMirror().withDeclaredSources(aNotionLocalMirror()).build();

  const fr = await gss.checkFreshness('team-a');

  assert.equal(fr.behind, false);
  assert.equal(fr.remoteWatermark, null);
  assert.equal(fr.localWatermark, null);
});
