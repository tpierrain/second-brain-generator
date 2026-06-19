import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileMcpServers } from "./mcp-reconcile.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// mcp-reconcile — pure, idempotent reconcile of a brain's .mcp.json against the
// engine's declared servers (ADR 0025). ADD only the `engineMcpServers` the brain
// is MISSING, taking each definition from the (already path-substituted) fetched
// .mcp.json.template; never clobber an existing server (engine OR user-added).
// ═══════════════════════════════════════════════════════════════════════════

const templateMcp = {
  mcpServers: {
    "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "/brains/foo", env: {} },
    "local-mirror": { type: "stdio", command: "npx", args: ["tsx", "local-mirror/src/server.ts"], cwd: "/brains/foo", env: {} },
  },
};

test("reconcileMcpServers — adds a missing engine server from the template", () => {
  const brainMcp = { mcpServers: { "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "/brains/foo", env: {} } } };
  const out = reconcileMcpServers({ brainMcp, templateMcp, engineServerIds: ["vault-rag", "local-mirror"] });
  assert.deepEqual(
    out.mcpServers["local-mirror"],
    templateMcp.mcpServers["local-mirror"],
    "the missing engine server must be added with the template's (path-substituted) definition",
  );
  assert.ok(out.mcpServers["vault-rag"], "the already-present engine server is kept");
});

test("reconcileMcpServers — a USER-added server is preserved (never clobbered, never dropped)", () => {
  const userServer = { type: "stdio", command: "node", args: ["my-tool.js"], cwd: "/brains/foo", env: {} };
  const brainMcp = {
    mcpServers: {
      "vault-rag": templateMcp.mcpServers["vault-rag"],
      "my-tool": userServer, // not an engine server
    },
  };
  const out = reconcileMcpServers({ brainMcp, templateMcp, engineServerIds: ["vault-rag", "local-mirror"] });
  assert.deepEqual(out.mcpServers["my-tool"], userServer, "the user's own server must survive the reconcile");
  assert.ok(out.mcpServers["local-mirror"], "the missing engine server is still added alongside it");
});

test("reconcileMcpServers — idempotent: re-running when every engine server is present changes nothing", () => {
  const brainMcp = {
    mcpServers: {
      "vault-rag": templateMcp.mcpServers["vault-rag"],
      "local-mirror": templateMcp.mcpServers["local-mirror"],
    },
  };
  const out = reconcileMcpServers({ brainMcp, templateMcp, engineServerIds: ["vault-rag", "local-mirror"] });
  assert.deepEqual(out.mcpServers, brainMcp.mcpServers, "a 2nd pass must be a no-op (no duplicate, no diff)");
});
