import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionPage, aNotionLocalMirror } from './builder.js';

// Acceptance tests at the API port (ILocalMirror). `remove_source` (PRD §9) de-registers a
// source from the config (the versioned source of truth). With `cleanup`, it also deletes the
// synced `.md` files and the sidecar state — opt-in, so a plain de-register never touches files.

test('removing a source de-registers it but keeps the files by default', async () => {
  const harness = aLocalMirror().withNotionPages(aNotionPage({ id: 'p1' }));
  const gss = harness.build();
  await gss.sync('team-a');

  const result = await gss.removeSource('team-a');

  assert.equal(result.removed, true);
  assert.equal(result.cleanedUp, false);
  assert.deepEqual(await gss.listSources(), []);
  assert.ok(harness.vaultFiles().has('mirrors/team-a/p1.md'), 'files kept unless cleanup');
});

test('removing a source with cleanup also deletes its files', async () => {
  const harness = aLocalMirror().withNotionPages(
    aNotionPage({ id: 'p1' }),
    aNotionPage({ id: 'p2' }),
  );
  const gss = harness.build();
  await gss.sync('team-a');

  const result = await gss.removeSource('team-a', true);

  assert.equal(result.removed, true);
  assert.equal(result.cleanedUp, true);
  assert.deepEqual(await gss.listSources(), []);
  assert.equal(harness.vaultFiles().size, 0, 'cleanup deletes every synced .md');
});

test('removing an unknown source is a graceful no-op — even when OTHER sources exist', async () => {
  // A non-empty config list is what makes this bite: the `some(c.name === name)` membership test
  // must key on the NAME, not merely "is the list non-empty".
  const harness = aLocalMirror().withNotionPages(aNotionPage({ id: 'p1' }));
  const gss = harness.build();
  await gss.sync('team-a');

  const result = await gss.removeSource('nope', true);

  assert.equal(result.removed, false);
  assert.equal(result.cleanedUp, false);
  const remaining = await gss.listSources();
  assert.deepEqual(remaining.map((s) => s.name), ['team-a'], 'the real source is untouched');
});

test('removing one of several declared sources removes only it, leaving the rest', async () => {
  // With more than one source, membership must be ANY-match (some), not ALL-match (every):
  // removing an existing source while others remain must still succeed.
  const gss = aLocalMirror()
    .withDeclaredSources(
      aNotionLocalMirror({ name: 'team-a' }),
      aNotionLocalMirror({ name: 'team-b' }),
    )
    .build();

  const result = await gss.removeSource('team-a');

  assert.equal(result.removed, true);
  const remaining = await gss.listSources();
  assert.deepEqual(remaining.map((s) => s.name), ['team-b']);
});

test('cleanup on a declared-but-never-synced source is a no-throw no-op delete', async () => {
  // persisted state is null here (never synced); cleanup must iterate an empty item map, not
  // dereference null — and still report cleanedUp true.
  const gss = aLocalMirror().withDeclaredSources(aNotionLocalMirror()).build();

  const result = await gss.removeSource('team-a', true);

  assert.equal(result.removed, true);
  assert.equal(result.cleanedUp, true);
  assert.deepEqual(await gss.listSources(), []);
});
