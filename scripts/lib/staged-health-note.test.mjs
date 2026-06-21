import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { seedHealthNote } from "./staged-health-note.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// staged-health-note — the engine's `health_check` canary note lives at the
// NON-sacred staging path `engine-health/health-check.md` (a `replace` file the
// engine DELIVERS), because its runtime home `vault/engine-health/health-check.md`
// is SACRED (computeApplyPlan scrubs `vault/`). seedHealthNote install-if-absent's
// the staged note into the vault — in BOTH update (sourceDir !== brainDir) and
// self-heal (sourceDir === brainDir) modes, since the staged source is on the
// brain's own disk (src `engine-health/…` ≠ dest `vault/engine-health/…`).
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_NOTE = "vault/engine-health/health-check.md";
const STAGED_NOTE = "engine-health/health-check.md";

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function freshDirs(t) {
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-health-src-"));
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-health-brain-"));
  t.after(() => {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(brainDir, { recursive: true, force: true });
  });
  return { sourceDir, brainDir };
}

test("seedHealthNote — seeds the vault note from the staged copy when the vault note is ABSENT, reports present", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  const body = "---\ntitle: Engine health check\n---\nQuibblethorne canary — engine-owned.\n";
  writeFile(sourceDir, STAGED_NOTE, body);

  const result = seedHealthNote({ sourceDir, brainDir });

  assert.equal(readFileSync(join(brainDir, HEALTH_NOTE), "utf8"), body, "the vault note must be seeded from the staged copy");
  assert.equal(result.present, true, "the vault note is present after seeding");
});

test("seedHealthNote — NEVER overwrites a vault note the brain already has (a user may have edited it), still reports present", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);
  writeFile(sourceDir, STAGED_NOTE, "---\ntitle: staged\n---\nQuibblethorne (staged copy).\n");
  const mine = "---\ntitle: mine\n---\nQuibblethorne (my edited copy, kept).\n";
  writeFile(brainDir, HEALTH_NOTE, mine);

  const result = seedHealthNote({ sourceDir, brainDir });

  assert.equal(readFileSync(join(brainDir, HEALTH_NOTE), "utf8"), mine, "an existing vault note must never be overwritten");
  assert.equal(result.present, true, "an existing vault note still reports present");
});

test("seedHealthNote — SELF-HEAL mode (sourceDir === brainDir) seeds the vault note from the brain's OWN staged copy (the F-B7b fix)", (t) => {
  const { brainDir } = freshDirs(t);
  const body = "---\ntitle: Engine health check\n---\nQuibblethorne canary.\n";
  // The update delivered the staged note onto the brain's disk (non-sacred `replace`);
  // the restart's self-heal runs with sourceDir === brainDir and must STILL seed the vault.
  writeFile(brainDir, STAGED_NOTE, body);

  const result = seedHealthNote({ sourceDir: brainDir, brainDir });

  assert.equal(readFileSync(join(brainDir, HEALTH_NOTE), "utf8"), body, "self-heal must seed the vault note from the brain's own staged copy");
  assert.equal(result.present, true);
});

test("seedHealthNote — no staged note at the source → seeds nothing, reports absent", (t) => {
  const { sourceDir, brainDir } = freshDirs(t);

  const result = seedHealthNote({ sourceDir, brainDir });

  assert.equal(result.present, false, "with nothing staged there is nothing to seed");
  assert.ok(!existsSync(join(brainDir, HEALTH_NOTE)), "no vault note is created out of thin air");
});
