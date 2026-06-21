import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionPage } from './builder.js';

// Acceptance tests at the API port (ILocalMirror), driven by the Builder with a
// stubbed connector. `setup_source` (PRD §13) onboards a brand-new source: it tests the
// scope (a scoped search must return the zone — 0 pages = root not connected), then
// declares the source (config file) and runs a first sync, explaining each step.

const aSetupRequest = (overrides: Record<string, string> = {}) => ({
  name: 'team-a',
  title: 'Team A — invoices',
  description: 'Questions about team workflows.',
  rootPageUrl: 'https://www.notion.so/acme/Page-0123abc0b1c24d6e8f0a1b2c3d4e5f60',
  tokenEnv: 'GOLDEN_TEAM_A_NOTION_TOKEN',
  ...overrides,
});

test('setting up a connectable source declares it and runs a first sync', async () => {
  const harness = aLocalMirror().withConnectablePages(aNotionPage({ id: 'page-1' }));
  const gss = harness.build();

  const result = await gss.setupSource(aSetupRequest());

  assert.equal(result.ok, true);
  const declared = await harness.declaredSources();
  assert.equal(declared.length, 1, 'the source must be written to the config file');
  assert.equal(declared[0].name, 'team-a');
  const sources = await gss.listSources();
  assert.equal(sources[0].itemCount, 1, 'the first sync must have synced the zone');
  assert.ok(harness.vaultFiles().has('mirrors/team-a/page-1.md'));
});

test('setting up a zone whose root is not connected returns a clear message and declares nothing', async () => {
  const harness = aLocalMirror(); // no pages → scoped search returns 0
  const gss = harness.build();

  const result = await gss.setupSource(aSetupRequest());

  assert.equal(result.ok, false);
  assert.match(result.message, /not connected/i);
  assert.equal((await harness.declaredSources()).length, 0, 'a failed scope test declares nothing');
  assert.equal(harness.vaultFiles().size, 0, 'no .md written when the scope test fails');
});

test('setting up a zone whose token is invalid distinguishes auth error from "0 pages"', async () => {
  const harness = aLocalMirror()
    .withConnectablePages(aNotionPage())
    .withFailingEnumeration('notion: 401 unauthorized');
  const gss = harness.build();

  const result = await gss.setupSource(aSetupRequest());

  assert.equal(result.ok, false);
  assert.match(result.message, /401|valid .*token/i);
  assert.doesNotMatch(result.message, /returned 0 pages/, 'an auth error is not "root not connected"');
  assert.equal((await harness.declaredSources()).length, 0, 'a failed scope test declares nothing');
});
