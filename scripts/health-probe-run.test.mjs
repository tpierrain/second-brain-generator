import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runProbeChild, toBannerVerdict } from "./health-probe-run.mjs";

const PROBE = join(dirname(fileURLToPath(import.meta.url)), "health-probe-run.mjs");

// runProbeChild (ADR 0028, F7, baby-step 4) is the DETACHED probe child's pure
// orchestration: it runs the health probes, persists the fresh verdict, and fires
// an OS notification ONLY for a capability that is NEWLY broken (broken now AND not
// broken in the prior verdict) — so a still-broken capability never re-nags every
// session. All I/O is injected (runProbes / readPriorVerdict / writeVerdict / notify).

function seams(overrides = {}) {
  const calls = { written: [], notified: [] };
  const base = {
    runProbes: () => [
      { capability: "rag", status: "ok", detail: "canary found (3)" },
      { capability: "index", status: "ok", detail: "42 rows" },
    ],
    readPriorVerdict: () => null,
    writeVerdict: (v) => calls.written.push(v),
    notify: (p) => calls.notified.push(p),
  };
  return { args: { ...base, ...overrides }, calls };
}

test("runProbeChild — all ok → persists the verdict, notifies nothing", async () => {
  const { args, calls } = seams();
  const result = await runProbeChild(args);
  assert.equal(calls.written.length, 1);
  assert.deepEqual(calls.written[0], result.verdict);
  assert.equal(calls.notified.length, 0);
});

test("runProbeChild — a capability broke since last check → notifies for that capability", async () => {
  const { args, calls } = seams({
    runProbes: () => [
      { capability: "rag", status: "broken", detail: "canary not found in the vault" },
      { capability: "index", status: "ok", detail: "42 rows" },
    ],
    readPriorVerdict: () => [
      { capability: "rag", status: "ok" },
      { capability: "index", status: "ok" },
    ],
  });
  await runProbeChild(args);
  assert.equal(calls.notified.length, 1);
  assert.equal(calls.notified[0].capability, "rag");
});

// toBannerVerdict maps the runner's per-module result onto the persisted shape
// formatHealthBanner reads. It must carry the STRUCTURED `checks` through (not only a
// flattened `detail`), otherwise the banner can't give per-cause actionable gestures
// (ADR 0030 F7-ter, baby-step 5) and would fall back to a generic restart hint.
test("toBannerVerdict — preserves the per-module structured checks for the banner", () => {
  const verdict = toBannerVerdict([
    {
      module: "vault-rag",
      status: "broken",
      checks: [
        { name: "index", status: "broken", detail: "index empty" },
        { name: "embedder", status: "ok", detail: "in-process ready" },
      ],
    },
  ]);
  assert.equal(verdict[0].capability, "vault-rag");
  assert.equal(verdict[0].status, "broken");
  assert.ok(Array.isArray(verdict[0].checks), "checks array carried through");
  assert.deepEqual(verdict[0].checks[0], { name: "index", status: "broken", detail: "index empty" });
});

// #5 (code-review): the detached child's MAIN GLUE must honour its fail-open contract
// ("ALWAYS exit 0"). A corrupt/partially-written engine-manifest.json (mid-update) made
// the top-level JSON.parse throw OUTSIDE the promise chain → the child exited non-zero
// and the verdict cache was silently never refreshed. Spawn the REAL child against a
// corrupt brain and assert it still exits 0 (no verdict written, no throw).
test("main glue — a corrupt engine-manifest.json yields exit 0 + no verdict write (fail-open #5)", () => {
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-probe-corrupt-"));
  try {
    writeFileSync(join(brainDir, "engine-manifest.json"), "{ not valid json");
    writeFileSync(join(brainDir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));

    let exitCode = -1;
    try {
      execFileSync(process.execPath, [PROBE, "--brainDir", brainDir], { stdio: "ignore" });
      exitCode = 0;
    } catch (e) {
      exitCode = e.status ?? 1;
    }
    assert.equal(exitCode, 0, "a corrupt manifest must never make the detached probe exit non-zero");
    assert.equal(
      existsSync(join(brainDir, "engine-health.json")),
      false,
      "a probe that never ran must not write a (misleading) verdict",
    );
  } finally {
    rmSync(brainDir, { recursive: true, force: true });
  }
});

test("runProbeChild — a still-broken capability does NOT re-nag (already broken last time)", async () => {
  const { args, calls } = seams({
    runProbes: () => [
      { capability: "rag", status: "broken", detail: "canary not found in the vault" },
      { capability: "index", status: "ok", detail: "42 rows" },
    ],
    readPriorVerdict: () => [
      { capability: "rag", status: "broken" },
      { capability: "index", status: "ok" },
    ],
  });
  await runProbeChild(args);
  assert.equal(calls.written.length, 1); // verdict still refreshed
  assert.equal(calls.notified.length, 0); // but no repeat notification
});
