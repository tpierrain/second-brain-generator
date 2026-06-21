import { test } from "node:test";
import assert from "node:assert/strict";
import { gateBlockers, optionalBroken } from "./health-check-gate.mjs";

// The LOUD-GATE policy shared by verify-rag.mjs + the installer post-flight (ADR
// 0030: "policy in the caller", but the two loud gates share ONE policy). Over the
// runner's per-module verdicts, it returns the modules that must block the gate
// (→ exit 1, named). It blocks on any `broken`, and on a MANDATORY module that is
// merely `unknown` (we can't PROVE the brain's mandatory capability works). An
// OPTIONAL module that's `unknown` (e.g. an unconfigured local-mirror on a fresh
// install) is benign → never blocks (no cry-wolf, no false install failure).

const MANIFEST = {
  engineModuleRequirements: { "vault-rag": "mandatory", "local-mirror": "optional" },
};

test("a MANDATORY broken module blocks the gate", () => {
  const result = { status: "broken", modules: [{ module: "vault-rag", status: "broken", checks: [] }] };
  const blockers = gateBlockers(result, MANIFEST);
  assert.deepEqual(blockers.map((m) => m.module), ["vault-rag"]);
});

test("an OPTIONAL broken module never blocks the gate — a loud warning, not a false install failure (#3)", () => {
  // local-mirror is optional; its server may not boot on a fresh install (installer
  // only WARNs on its npm install). A broken optional module must NOT exit 1 over an
  // otherwise-healthy brain — only the mandatory capability gates the install.
  const result = {
    status: "broken",
    modules: [
      { module: "vault-rag", status: "ok", checks: [] },
      { module: "local-mirror", status: "broken", checks: [] },
    ],
  };
  assert.deepEqual(gateBlockers(result, MANIFEST), []);
});

test("a broken module with NO declared requirement still blocks (default = treat as mandatory)", () => {
  const result = { status: "broken", modules: [{ module: "vault-rag", status: "broken", checks: [] }] };
  // No requirements declared at all → a proven break must still gate (belt-and-suspenders).
  assert.deepEqual(gateBlockers(result, {}).map((m) => m.module), ["vault-rag"]);
});

test("a MANDATORY module that is merely unknown blocks the gate (can't prove it works)", () => {
  const result = { status: "unknown", modules: [{ module: "vault-rag", status: "unknown", checks: [] }] };
  const blockers = gateBlockers(result, MANIFEST);
  assert.deepEqual(blockers.map((m) => m.module), ["vault-rag"]);
});

test("an OPTIONAL module that's unknown (unconfigured) never blocks — no false install failure", () => {
  const result = {
    status: "unknown",
    modules: [
      { module: "vault-rag", status: "ok", checks: [] },
      { module: "local-mirror", status: "unknown", checks: [] },
    ],
  };
  assert.deepEqual(gateBlockers(result, MANIFEST), []);
});

test("optionalBroken — names the broken OPTIONAL modules so the caller can warn loudly (#3)", () => {
  const result = {
    status: "broken",
    modules: [
      { module: "vault-rag", status: "ok", checks: [] },
      { module: "local-mirror", status: "broken", checks: [] },
    ],
  };
  assert.deepEqual(optionalBroken(result, MANIFEST).map((m) => m.module), ["local-mirror"]);
});

test("optionalBroken — a broken MANDATORY module is not listed here (it's a gate blocker instead)", () => {
  const result = { status: "broken", modules: [{ module: "vault-rag", status: "broken", checks: [] }] };
  assert.deepEqual(optionalBroken(result, MANIFEST), []);
});

test("all ok → no blockers (gate passes)", () => {
  const result = {
    status: "ok",
    modules: [{ module: "vault-rag", status: "ok", checks: [] }],
  };
  assert.deepEqual(gateBlockers(result, MANIFEST), []);
});
