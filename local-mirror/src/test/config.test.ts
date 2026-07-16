import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, dirname, join, resolve, basename } from 'node:path';
import {
  resolvePath,
  loadEnvIfPresent,
  VAULT_DIR,
  SIDECAR_DIR,
  CONFIG_PATH,
} from '../lib/config.js';

test('resolvePath: a non-empty env value wins, resolved to absolute', () => {
  // Compare against resolve() (not a literal) so this holds on Windows too, where
  // resolve('/tmp/x') is drive-anchored (e.g. C:\tmp\x), not '/tmp/x'.
  assert.equal(resolvePath('/tmp/x', '/fallback'), resolve('/tmp/x'));
  assert.ok(isAbsolute(resolvePath('relative/dir', '/fallback')));
});

test('resolvePath: empty/whitespace/undefined falls back', () => {
  assert.equal(resolvePath(undefined, '/fallback'), '/fallback');
  assert.equal(resolvePath('', '/fallback'), '/fallback');
  assert.equal(resolvePath('   ', '/fallback'), '/fallback');
});

test('paths: defaults rooted at the repo, all absolute', () => {
  for (const p of [VAULT_DIR, SIDECAR_DIR, CONFIG_PATH]) assert.ok(isAbsolute(p));
  // basename() is separator-agnostic (kills the '/vault'→… substring looseness AND
  // works on Windows where the separator is a backslash).
  assert.equal(basename(VAULT_DIR), 'vault');
  assert.equal(basename(SIDECAR_DIR), '.local-mirror');
  assert.equal(basename(CONFIG_PATH), 'local-mirror.config.json');
});

test('paths: projectRoot climbs to the actual repo root (sibling packages present)', () => {
  // The default root is `<repo>` (three levels up from src/lib). Pinning it structurally kills
  // the `'../../..'`→`''` mutant, which would collapse the root down into src/lib.
  const root = dirname(VAULT_DIR); // <root>/vault → <root>
  assert.ok(existsSync(join(root, 'rag')), `expected sibling rag/ under ${root}`);
  assert.ok(existsSync(join(root, 'local-mirror')), `expected sibling local-mirror/ under ${root}`);
});

test('loadEnvIfPresent: loads with the exact { path } when the file exists', () => {
  const calls: Array<{ path: string }> = [];
  const loaded = loadEnvIfPresent('/tmp/whatever/.env', {
    existsSync: () => true,
    loadDotenv: (opts) => calls.push(opts),
  });
  assert.equal(loaded, true);
  assert.deepEqual(calls, [{ path: '/tmp/whatever/.env' }]);
});

test('loadEnvIfPresent: does nothing when the file is absent', () => {
  const calls: Array<{ path: string }> = [];
  const loaded = loadEnvIfPresent('/tmp/whatever/.env', {
    existsSync: () => false,
    loadDotenv: (opts) => calls.push(opts),
  });
  assert.equal(loaded, false);
  assert.deepEqual(calls, []);
});

test('loadEnvIfPresent: default deps really load dotenv into process.env', () => {
  // Exercises the DEFAULT wiring (real existsSync + real `loadDotenv(opts)`), which the
  // injected-fake tests above never touch. Kills the `(opts) => loadDotenv(opts)`→`() => undefined`
  // mutant on the default dep.
  const dir = mkdtempSync(join(tmpdir(), 'lm-cfgenv-'));
  const envPath = join(dir, '.env');
  const key = 'LM_CONFIG_TEST_VAR';
  writeFileSync(envPath, `${key}=loaded-for-real\n`);
  delete process.env[key];
  try {
    const loaded = loadEnvIfPresent(envPath);
    assert.equal(loaded, true);
    assert.equal(process.env[key], 'loaded-for-real');
  } finally {
    delete process.env[key];
    rmSync(dir, { recursive: true, force: true });
  }
});
