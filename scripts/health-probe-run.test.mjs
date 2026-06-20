import { test } from "node:test";
import assert from "node:assert/strict";
import { runProbeChild } from "./health-probe-run.mjs";

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
