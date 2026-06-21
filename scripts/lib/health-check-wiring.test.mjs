import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthCheckCaller } from "./health-check-wiring.mjs";

// The shared .mcp.json → { isRegistered, callHealthCheck } resolution (ADR 0030,
// F7-bis): all three callers (verify-rag, installer post-flight, runtime probe) feed
// the result to runActivatedHealthChecks, so the server-lookup + round-trip wiring
// lives in ONE tested place. The real MCP seam (callMcpHealthCheck) is injectable.

const MCP_SERVERS = {
  "vault-rag": { command: "node", args: ["rag/src/index.ts"], cwd: "/brain" },
  "local-mirror": { command: "node", args: ["local-mirror/src/index.ts"], cwd: "/brain" },
};

test("isRegistered reflects presence in .mcp.json", () => {
  const { isRegistered } = buildHealthCheckCaller({ mcpServers: MCP_SERVERS });
  assert.equal(isRegistered("vault-rag"), true);
  assert.equal(isRegistered("nope"), false);
});

test("callHealthCheck resolves the module's server config and forwards it (+platform) to the seam", async () => {
  let seen;
  const verdict = { status: "ok", checks: [] };
  const { callHealthCheck } = buildHealthCheckCaller({
    mcpServers: MCP_SERVERS,
    platform: "win32",
    callHealthCheck: async (opts) => {
      seen = opts;
      return verdict;
    },
  });
  const result = await callHealthCheck("vault-rag");
  assert.deepEqual(seen.server, MCP_SERVERS["vault-rag"]);
  assert.equal(seen.platform, "win32");
  assert.deepEqual(result, verdict);
});

test("timeoutMs and env are threaded through to the seam (loud gates mute the toast + add headroom)", async () => {
  let seen;
  const { callHealthCheck } = buildHealthCheckCaller({
    mcpServers: MCP_SERVERS,
    timeoutMs: 60000,
    env: { SBG_NO_NOTIFY: "1" },
    callHealthCheck: async (opts) => {
      seen = opts;
      return { status: "ok", checks: [] };
    },
  });
  await callHealthCheck("vault-rag");
  assert.equal(seen.timeoutMs, 60000);
  assert.deepEqual(seen.env, { SBG_NO_NOTIFY: "1" });
});
