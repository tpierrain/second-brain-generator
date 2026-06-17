import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotionConnector } from '../adapters/notion-gateway.js';
import { aNotionGoldenSource } from './builder.js';

// The factory reads the integration token from the configured env var — never from the
// config file, never logged (PRD §11). Building does not hit the network, so this is a
// pure unit test of the env/auth plumbing.

function sourceWithTokenEnv(tokenEnv: string) {
  return aNotionGoldenSource({
    connector: {
      type: 'notion',
      config: { root_page_url: 'https://www.notion.so/inqom/HUB-304a2ca0b1c24d6e8f0a1b2c3d4e5f60', token_env: tokenEnv },
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
