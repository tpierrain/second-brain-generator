import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionPage } from './builder.js';

// Acceptance tests at the API port (ILocalMirror). Step 5 adds deletion reconciliation
// on top of the Step 3 delta: the watermark catches edits/additions but NOT deletions or
// scope-exits (PRD §7). On each sync we enumerate the current perimeter, compare it to the
// state map, and delete the `.md` whose source page disappeared — but ONLY when the
// enumeration fully succeeded (the non-negotiable §7/§12 guardrail).

test('a page that left the Notion perimeter has its .md deleted', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'page-1', content: 'Kept.\n' }),
    aNotionPage({ id: 'page-2', content: 'Gone tomorrow.\n' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withoutPage('page-2');
  const report = await gss.sync('team-a');

  assert.equal(report.deleted, 1);
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-1.md'));
  assert.ok(!harness.vaultFiles().has('mirrors/team-a/page-2.md'));
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 1); // page-2 no longer tracked in the state map
});

// THE #1 risk (PRD §7/§12, non-negotiable): an enumeration error (401/429/network/truncated
// pagination) must NEVER read as "empty perimeter", or the whole corpus would be wiped. A
// failed enumeration deletes NOTHING, marks the sync partial, and freezes the watermark.
test('a failed perimeter enumeration deletes nothing and freezes the watermark', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'page-1', lastEditedTime: '2026-06-10T08:00:00.000Z' }),
    aNotionPage({ id: 'page-2', lastEditedTime: '2026-06-15T09:32:00.000Z' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withFailingEnumeration('notion: 401 unauthorized');
  const report = await gss.sync('team-a');

  assert.equal(report.status, 'partial');
  assert.equal(report.deleted, 0);
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-1.md'));
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-2.md'));
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 2); // both pages still tracked — nothing pruned
  assert.equal(source.watermark, '2026-06-15T09:32:00.000Z'); // frozen at the last good sync
  assert.equal(source.lastSyncStatus, 'partial');
});

// A delete that FAILS (I/O, permission, transient FS error) must not abort the sync after the
// page writes already landed — that would leave the vault diverged from the saved state (writes
// on disk, state never persisted). Instead: the run is `partial` (watermark frozen), the page
// stays tracked so the NEXT sync retries its removal, and the still-present file is untouched.
test('a failing deletion does not abort the sync and keeps the page tracked for retry', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'page-1', content: 'Kept.\n' }),
    aNotionPage({ id: 'page-2', content: 'Gone tomorrow.\n' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness
    .withoutPage('page-2')
    .withFailingDeletionOf('mirrors/team-a/page-2.md');
  const report = await gss.sync('team-a'); // must NOT throw

  assert.equal(report.status, 'partial'); // a failed delete is not a clean sync
  assert.equal(report.deleted, 0); // the delete did not succeed
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-1.md'));
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-2.md')); // still on disk
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 2); // page-2 kept tracked → next sync retries the delete
  assert.equal(source.lastSyncStatus, 'partial');
});

// A rename in Notion keeps the page id (the `.md` is keyed by id, not title — PRD §6), so it
// must rewrite the SAME file with no duplicate or orphan, and reconcile no deletion.
test('renaming a page rewrites the same .md without orphaning a file', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'page-1', title: 'Old title', content: 'Body v1.\n' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withRevisedPage(aNotionPage({ id: 'page-1', title: 'New title', content: 'Body v1.\n' }));
  const report = await gss.sync('team-a');

  assert.equal(report.written, 1); // title lives in the frontmatter → markdown hash changed
  assert.equal(report.deleted, 0);
  assert.equal(harness.vaultFiles().size, 1);
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-1.md'));
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 1);
});

// The silent catastrophic case (PRD §12): a disconnected root / lost scope makes Notion's
// `search` return ZERO pages WITHOUT an error. A wholesale "everything disappeared" must never
// be taken at face value against a non-empty corpus — it would wipe the whole local mirror.
// We treat an empty perimeter over previously-tracked items as suspicious: delete nothing,
// mark partial, freeze the watermark; a genuine N→1 deletion still reconciles (the test above).
test('an empty perimeter over a non-empty corpus deletes nothing (lost scope, not real emptiness)', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'page-1' }),
    aNotionPage({ id: 'page-2' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  harness.withoutPage('page-1').withoutPage('page-2');
  const report = await gss.sync('team-a');

  assert.equal(report.status, 'partial');
  assert.equal(report.deleted, 0);
  assert.equal(harness.vaultFiles().size, 2); // whole corpus preserved
  const [source] = await gss.listSources();
  assert.equal(source.itemCount, 2);
  assert.equal(source.lastSyncStatus, 'partial');
});
