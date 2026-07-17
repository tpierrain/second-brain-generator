import { test } from "node:test";
import assert from "node:assert/strict";

import { runConsolidateScan } from "./consolidate-scan.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// consolidate-scan — the thin CLI glue over the pure Track C candidate core. It
// reads the vault and prints an honest list of what needs consolidating, with a
// binary exit code (0 nothing to consolidate / 1 candidates found), so it
// composes in scripts. All side effects come through an injected `deps` port so
// the glue itself is unit-testable (no untestable top-level side effects).
// ═══════════════════════════════════════════════════════════════════════════

function fakeDeps(overrides = {}) {
  const logs = [];
  const seenDirs = [];
  const deps = {
    cwd: () => "/brain",
    readNotes: (dir) => {
      seenDirs.push(dir);
      return [];
    },
    log: (line) => logs.push(line),
    ...overrides,
  };
  return { deps, logs, seenDirs };
}

test("runConsolidateScan — a vault with nothing to consolidate prints the count + clean line and exits 0", () => {
  const { deps, logs, seenDirs } = fakeDeps();
  const code = runConsolidateScan([], deps);
  assert.equal(code, 0);
  assert.deepEqual(seenDirs, ["/brain/vault"]);
  assert.deepEqual(logs, ["Scanned 0 notes under /brain/vault", "✓ Nothing to consolidate"]);
});

test("runConsolidateScan — a vault with candidates prints the report and exits 1", () => {
  const notes = [
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "[[Marie Dupont]] a tranché.",
    },
  ];
  const { deps, logs } = fakeDeps({ readNotes: () => notes });
  const code = runConsolidateScan([], deps);
  assert.equal(code, 1);
  assert.equal(logs[0], "Scanned 1 notes under /brain/vault");
  assert.ok(logs.includes("✗ Consolidation candidates found"), "prints the candidates header");
  assert.ok(
    logs.includes("  [[Marie Dupont]] — cited by 1: meetings/2026-07-15-revue.md"),
    "lists the new-page candidate",
  );
});

test("runConsolidateScan — an explicit path argument overrides the default ./vault", () => {
  const { deps, seenDirs } = fakeDeps();
  runConsolidateScan(["/data/other-vault"], deps);
  assert.deepEqual(seenDirs, ["/data/other-vault"]);
});
