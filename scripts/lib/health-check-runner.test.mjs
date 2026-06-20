import { test } from "node:test";
import assert from "node:assert/strict";
import { runActivatedHealthChecks } from "./health-check-runner.mjs";

// The shared orchestration behind all three health-check callers (ADR 0030, F7-bis):
// pick the ACTIVATED modules (selectModulesToCheck), call each module's MCP
// `health_check`, and aggregate into one verdict. The REACTION (exit 1 / exit 0 /
// notify) stays with each caller — this runner only produces the verdict.

const MANIFEST = {
  engineMcpServers: ["vault-rag", "local-mirror"],
  engineModuleRequirements: { "vault-rag": "mandatory", "local-mirror": "optional" },
};

test("a registered module whose health_check is ok → overall ok", async () => {
  const verdict = await runActivatedHealthChecks({
    manifest: { engineMcpServers: ["vault-rag"], engineModuleRequirements: { "vault-rag": "mandatory" } },
    isRegistered: () => true,
    callHealthCheck: async () => ({ status: "ok", checks: [] }),
  });
  assert.equal(verdict.status, "ok");
  assert.deepEqual(verdict.modules, [{ module: "vault-rag", status: "ok", checks: [] }]);
});

test("a registered module whose health_check is broken → overall broken", async () => {
  const verdict = await runActivatedHealthChecks({
    manifest: { engineMcpServers: ["vault-rag"], engineModuleRequirements: { "vault-rag": "mandatory" } },
    isRegistered: () => true,
    callHealthCheck: async () => ({ status: "broken", checks: [{ name: "index", status: "broken", detail: "empty" }] }),
  });
  assert.equal(verdict.status, "broken");
});

test("a mandatory module absent from .mcp.json → broken, surfaced without calling health_check", async () => {
  let called = false;
  const verdict = await runActivatedHealthChecks({
    manifest: { engineMcpServers: ["vault-rag"], engineModuleRequirements: { "vault-rag": "mandatory" } },
    isRegistered: () => false,
    callHealthCheck: async () => {
      called = true;
      return { status: "ok", checks: [] };
    },
  });
  assert.equal(called, false, "must not call health_check on an unwired server");
  assert.equal(verdict.status, "broken");
  assert.ok(
    verdict.modules.some((m) => m.module === "vault-rag" && m.status === "broken"),
    "the absent mandatory module is surfaced as a named broken module",
  );
});

test("real mix — vault-rag (ok) checked, local-mirror (optional, absent) skipped silently → overall ok", async () => {
  const registered = new Set(["vault-rag"]);
  const calls = [];
  const verdict = await runActivatedHealthChecks({
    manifest: MANIFEST,
    isRegistered: (id) => registered.has(id),
    callHealthCheck: async (id) => {
      calls.push(id);
      return { status: "ok", checks: [] };
    },
  });
  assert.deepEqual(calls, ["vault-rag"], "only the activated module is health-checked");
  assert.deepEqual(verdict.modules.map((m) => m.module), ["vault-rag"]);
  assert.equal(verdict.status, "ok");
});

test("fail-open — a health_check that throws → that module is unknown, runner never propagates", async () => {
  const verdict = await runActivatedHealthChecks({
    manifest: { engineMcpServers: ["vault-rag"], engineModuleRequirements: { "vault-rag": "mandatory" } },
    isRegistered: () => true,
    callHealthCheck: async () => {
      throw new Error("MCP handshake timeout");
    },
  });
  assert.equal(verdict.modules[0].status, "unknown");
  assert.equal(verdict.modules[0].module, "vault-rag");
});
