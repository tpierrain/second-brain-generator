import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { resolvePath, VAULT_DIR, SIDECAR_DIR, CONFIG_PATH } from '../lib/config.js';

test('resolvePath: a non-empty env value wins, resolved to absolute', () => {
  assert.equal(resolvePath('/tmp/x', '/fallback'), '/tmp/x');
  assert.ok(isAbsolute(resolvePath('relative/dir', '/fallback')));
});

test('resolvePath: empty/whitespace/undefined falls back', () => {
  assert.equal(resolvePath(undefined, '/fallback'), '/fallback');
  assert.equal(resolvePath('', '/fallback'), '/fallback');
  assert.equal(resolvePath('   ', '/fallback'), '/fallback');
});

test('paths: defaults rooted at the repo, all absolute', () => {
  for (const p of [VAULT_DIR, SIDECAR_DIR, CONFIG_PATH]) assert.ok(isAbsolute(p));
  assert.ok(VAULT_DIR.endsWith('/vault'), VAULT_DIR);
  assert.ok(SIDECAR_DIR.endsWith('/.golden-source-sync'), SIDECAR_DIR);
  assert.ok(CONFIG_PATH.endsWith('/golden-source-sync.config.json'), CONFIG_PATH);
});
