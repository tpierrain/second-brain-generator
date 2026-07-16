import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEnvVarFresh } from '../lib/fresh-env.js';

// `readEnvVarFresh` reads a single var FRESH from the `.env` pointed at by SBG_ENV_PATH
// (resolved via config.resolveEnvPath). We drive it against a real temp `.env` so the
// existsSync / dotenv-parse / trim guards are all exercised.
function withEnvFile(contents: string | null, run: () => void) {
  const dir = mkdtempSync(join(tmpdir(), 'lm-freshenv-'));
  const envPath = join(dir, '.env');
  if (contents !== null) writeFileSync(envPath, contents);
  const prev = process.env.SBG_ENV_PATH;
  process.env.SBG_ENV_PATH = envPath;
  try {
    run();
  } finally {
    if (prev === undefined) delete process.env.SBG_ENV_PATH;
    else process.env.SBG_ENV_PATH = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('readEnvVarFresh: returns the freshly-written value', () => {
  withEnvFile('MY_TOKEN=secret-123\n', () => {
    assert.equal(readEnvVarFresh('MY_TOKEN'), 'secret-123');
  });
});

test('readEnvVarFresh: absent file → undefined (no throw)', () => {
  withEnvFile(null, () => {
    assert.equal(readEnvVarFresh('MY_TOKEN'), undefined);
  });
});

test('readEnvVarFresh: key absent from an existing file → undefined', () => {
  withEnvFile('OTHER=x\n', () => {
    assert.equal(readEnvVarFresh('MY_TOKEN'), undefined);
  });
});

test('readEnvVarFresh: empty value → undefined', () => {
  withEnvFile('MY_TOKEN=\n', () => {
    assert.equal(readEnvVarFresh('MY_TOKEN'), undefined);
  });
});

test('readEnvVarFresh: whitespace-only value → undefined (trimmed away)', () => {
  // Double-quoted so dotenv PRESERVES the inner spaces — only the runtime `.trim()`
  // reduces it to empty. Kills the `value.trim()`→`value` and the `? :`→`true` mutants.
  withEnvFile('MY_TOKEN="   "\n', () => {
    assert.equal(readEnvVarFresh('MY_TOKEN'), undefined);
  });
});
