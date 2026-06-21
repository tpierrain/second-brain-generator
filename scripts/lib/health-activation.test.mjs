import { test } from "node:test";
import assert from "node:assert/strict";
import { selectModulesToCheck } from "./health-activation.mjs";

// "Only ACTIVATED modules are checked" (ADR 0030, F7-bis). Activation = presence in
// the brain's .mcp.json. The manifest tags each engine module mandatory | optional;
// this pure selector decides, per module, whether to run its health_check, report it
// broken (mandatory but absent), or skip it silently (optional and absent).

test("a registered module is queued to be checked", () => {
  const result = selectModulesToCheck({
    manifest: {
      engineMcpServers: ["vault-rag"],
      engineModuleRequirements: { "vault-rag": "mandatory" },
    },
    isRegistered: () => true,
  });
  assert.deepEqual(result.toCheck, ["vault-rag"]);
});

test("a mandatory module absent from .mcp.json is reported broken, not checked", () => {
  const result = selectModulesToCheck({
    manifest: {
      engineMcpServers: ["vault-rag"],
      engineModuleRequirements: { "vault-rag": "mandatory" },
    },
    isRegistered: () => false,
  });
  assert.deepEqual(result.toCheck, []);
  assert.deepEqual(result.brokenMissing, ["vault-rag"]);
});

test("an optional module absent from .mcp.json is skipped silently", () => {
  const result = selectModulesToCheck({
    manifest: {
      engineMcpServers: ["local-mirror"],
      engineModuleRequirements: { "local-mirror": "optional" },
    },
    isRegistered: () => false,
  });
  assert.deepEqual(result.toCheck, []);
  assert.deepEqual(result.brokenMissing, []);
  assert.deepEqual(result.skipped, ["local-mirror"]);
});

test("an untagged module defaults to optional (additive: never a false broken)", () => {
  const result = selectModulesToCheck({
    manifest: { engineMcpServers: ["future-module"], engineModuleRequirements: {} },
    isRegistered: () => false,
  });
  assert.deepEqual(result.brokenMissing, []);
  assert.deepEqual(result.skipped, ["future-module"]);
});

test("real manifest mix — vault-rag (mandatory, registered) checked, local-mirror (optional, absent) skipped", () => {
  const registered = new Set(["vault-rag"]);
  const result = selectModulesToCheck({
    manifest: {
      engineMcpServers: ["vault-rag", "local-mirror"],
      engineModuleRequirements: { "vault-rag": "mandatory", "local-mirror": "optional" },
    },
    isRegistered: (id) => registered.has(id),
  });
  assert.deepEqual(result.toCheck, ["vault-rag"]);
  assert.deepEqual(result.brokenMissing, []);
  assert.deepEqual(result.skipped, ["local-mirror"]);
});
