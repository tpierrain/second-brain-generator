import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from '../index.js';
import { aLocalMirror } from './builder.js';

// Smoke test of the driving adapter: building the server registers the 7 tools with
// no name collision / invalid schema (registration is synchronous and throws on those).
// The behavioural surface is exercised through the API port (see list-sources.test.ts).
test('createMcpServer builds and registers the 7 tools without throwing', () => {
  const api = aLocalMirror().build();

  const server = createMcpServer(api);

  assert.ok(server);
});
