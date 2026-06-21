import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNotionConnector } from '../adapters/notion-gateway.js';
import { aNotionLocalMirror } from './builder.js';

// The factory reads the integration token from the configured env var — never from the
// config file, never logged (PRD §11). Building does not hit the network, so this is a
// pure unit test of the env/auth plumbing.

function sourceWithTokenEnv(tokenEnv: string) {
  return aNotionLocalMirror({
    connector: {
      type: 'notion',
      config: { root_page_url: 'https://www.notion.so/acme/Page-0123abc0b1c24d6e8f0a1b2c3d4e5f60', token_env: tokenEnv },
    },
  });
}

test('building a Notion connector fails clearly when the token env var is unset', () => {
  delete process.env.GOLDEN_TEST_TOKEN;

  assert.throws(() => buildNotionConnector(sourceWithTokenEnv('GOLDEN_TEST_TOKEN')), /GOLDEN_TEST_TOKEN/);
});

test('building a Notion connector succeeds when the token env var is set', () => {
  process.env.GOLDEN_TEST_TOKEN = 'ntn_secret_value';
  try {
    const connector = buildNotionConnector(sourceWithTokenEnv('GOLDEN_TEST_TOKEN'));
    assert.ok(connector);
    assert.equal(typeof connector.listItems, 'function');
  } finally {
    delete process.env.GOLDEN_TEST_TOKEN;
  }
});

// F3: the token used to be read once at boot (dotenv → process.env, frozen). A token pasted
// into `.env` mid-session was invisible → setup_source failed → forced restart. The factory
// must re-read the `.env` FRESH at call-time, so a token added after boot resolves with no restart.
test('reads a token added to .env AFTER boot, without a restart (F3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gss-env-'));
  const envFile = join(dir, '.env');
  const prevEnvPath = process.env.SBG_ENV_PATH;
  delete process.env.GOLDEN_TEST_TOKEN; // absent from the boot-frozen process.env
  process.env.SBG_ENV_PATH = envFile;
  try {
    // Simulate the user pasting the token into .env during the session.
    writeFileSync(envFile, 'GOLDEN_TEST_TOKEN=ntn_pasted_live\n');

    const connector = buildNotionConnector(sourceWithTokenEnv('GOLDEN_TEST_TOKEN'));

    assert.ok(connector);
    assert.equal(typeof connector.listItems, 'function');
  } finally {
    if (prevEnvPath === undefined) delete process.env.SBG_ENV_PATH;
    else process.env.SBG_ENV_PATH = prevEnvPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
