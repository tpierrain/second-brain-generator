import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mcpSearch } from "./mcp-search.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, "__fixtures__", "stub-mcp-server.mjs");

test("mcpSearch lance N requêtes sur une session et corrèle chaque réponse à sa query", async () => {
  const results = await mcpSearch({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    queries: ["première question", "deuxième question"],
    timeoutMs: 5000,
    env: { STUB_SEARCH: "echo" },
  });

  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { query: "première question", text: "query=première question" });
  assert.deepEqual(results[1], { query: "deuxième question", text: "query=deuxième question" });
});

test("mcpSearch rejette bruyamment si le serveur MCP meurt (pas de score faux)", async () => {
  await assert.rejects(
    mcpSearch({
      command: process.execPath,
      args: [STUB],
      cwd: HERE,
      queries: ["q"],
      timeoutMs: 5000,
      env: { STUB_MODE: "crash" },
    }),
    /termin|MCP/i
  );
});
