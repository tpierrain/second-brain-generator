import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aLocalMirror, aNotionPage, aNotionLocalMirror } from './builder.js';

// Acceptance tests at the API port (ILocalMirror). `health_check` (ADR 0030, F7-bis)
// reports whether the OPTIONAL Notion mirror is operational, in the standard
// { status, checks[] } contract — and NEVER cries "broken" when nothing is set up.

function checkNamed(report: { checks: { name: string; status: string }[] }, name: string) {
  const entry = report.checks.find((c) => c.name === name);
  assert.ok(entry, `expected a "${name}" check`);
  return entry;
}

test('nothing configured → status unknown, never broken', async () => {
  const lm = aLocalMirror().build();

  const report = await lm.healthCheck();

  assert.equal(report.status, 'unknown');
  assert.ok(report.checks.every((c) => c.status !== 'broken'));
});

test('a declared, synced source with readable state → status ok', async () => {
  const harness = aLocalMirror().withNotionPages(aNotionPage({ id: 'p1' }));
  const lm = harness.build();
  await lm.sync('team-a');

  const report = await lm.healthCheck();

  assert.equal(report.status, 'ok');
  assert.equal(checkNamed(report, 'config').status, 'ok');
  assert.equal(checkNamed(report, 'store').status, 'ok');
});

test('a declared source whose state store is unreachable → status broken', async () => {
  const lm = aLocalMirror()
    .withDeclaredSources(aNotionLocalMirror())
    .withUnreachableStore()
    .build();

  const report = await lm.healthCheck();

  assert.equal(report.status, 'broken');
  assert.equal(checkNamed(report, 'store').status, 'broken');
});
