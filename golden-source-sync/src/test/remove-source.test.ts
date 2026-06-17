import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aGoldenSourceSync, aNotionPage } from './builder.js';

// Acceptance tests at the API port (IGoldenSourceSync). `remove_source` (PRD §9) de-registers a
// source from the config (the versioned source of truth). With `cleanup`, it also deletes the
// synced `.md` files and the sidecar state — opt-in, so a plain de-register never touches files.

test('removing a source de-registers it but keeps the files by default', async () => {
  const harness = aGoldenSourceSync().withNotionPages(aNotionPage({ id: 'p1' }));
  const gss = harness.build();
  await gss.sync('pa-sc');

  const result = await gss.removeSource('pa-sc');

  assert.equal(result.removed, true);
  assert.equal(result.cleanedUp, false);
  assert.deepEqual(await gss.listSources(), []);
  assert.ok(harness.vaultFiles().has('golden-sources/pa-sc/p1.md'), 'files kept unless cleanup');
});

test('removing a source with cleanup also deletes its files', async () => {
  const harness = aGoldenSourceSync().withNotionPages(
    aNotionPage({ id: 'p1' }),
    aNotionPage({ id: 'p2' }),
  );
  const gss = harness.build();
  await gss.sync('pa-sc');

  const result = await gss.removeSource('pa-sc', true);

  assert.equal(result.removed, true);
  assert.equal(result.cleanedUp, true);
  assert.deepEqual(await gss.listSources(), []);
  assert.equal(harness.vaultFiles().size, 0, 'cleanup deletes every synced .md');
});

test('removing an unknown source is a graceful no-op', async () => {
  const gss = aGoldenSourceSync().build();

  const result = await gss.removeSource('nope', true);

  assert.equal(result.removed, false);
  assert.equal(result.cleanedUp, false);
});
