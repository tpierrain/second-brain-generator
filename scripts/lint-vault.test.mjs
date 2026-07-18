import { test } from "node:test";
import assert from "node:assert/strict";

import { runLint } from "./lint-vault.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// lint-vault — the thin CLI glue over the pure wiki-health core. Binary exit
// code (0 clean / 1 bleeding / 2 usage error). All side effects come through an
// injected `deps` port so the glue itself is unit-testable (no untestable
// top-level side effects — TDD mutation lesson #6).
// ═══════════════════════════════════════════════════════════════════════════

function fakeDeps(overrides = {}) {
  const logs = [];
  const errors = [];
  const seenDirs = [];
  const deps = {
    cwd: () => "/brain",
    readNotes: (dir) => {
      seenDirs.push(dir);
      return [];
    },
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
    ...overrides,
  };
  return { deps, logs, errors, seenDirs };
}

test("runLint — a clean vault prints the scan count + clean line and exits 0", () => {
  const { deps, logs, seenDirs } = fakeDeps();
  const code = runLint([], deps);
  assert.equal(code, 0);
  assert.deepEqual(seenDirs, ["/brain/vault"]);
  assert.deepEqual(logs, ["Scanned 0 notes under /brain/vault", "✓ Wiki health: clean"]);
});

test("runLint — a bleeding vault prints the report and exits 1", () => {
  const notes = [{ path: "a.md", frontmatter: { type: "topic", created: "d", updated: "d", tags: ["t"] }, body: "[[Missing]]" }];
  const { deps, logs } = fakeDeps({ readNotes: () => notes });
  const code = runLint([], deps);
  assert.equal(code, 1);
  assert.equal(logs[0], "Scanned 1 notes under /brain/vault");
  assert.ok(logs.includes("✗ Wiki health: issues found"), "prints the bleeding header");
  assert.ok(logs.includes("  a.md → [[Missing]]"), "lists the dangling link");
});

test("runLint — an explicit path argument overrides the default ./vault", () => {
  const { deps, seenDirs } = fakeDeps();
  runLint(["/data/other-vault"], deps);
  assert.deepEqual(seenDirs, ["/data/other-vault"]);
});
