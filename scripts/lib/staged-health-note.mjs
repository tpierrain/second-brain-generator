// ─────────────────────────────────────────────────────────────────────────────
// staged-health-note.mjs — deliver the UPGRADER-BOUND `health_check` canary note
// (ADR 0026). Its runtime home `vault/engine-health/health-check.md` is SACRED
// (engine-apply-plan scrubs `vault/`), so the engine can't write it there directly.
// Instead its canonical source ships at the NON-sacred staging path
// `engine-health/health-check.md` (a `replace` file → pass-1/update delivers it,
// the scrub keeps it), and this helper install-if-absent's it into the vault.
//
// Works in BOTH update (sourceDir !== brainDir) and SessionStart self-heal
// (sourceDir === brainDir) modes: the staged source is on the brain's OWN disk, and
// src path `engine-health/…` ≠ dest `vault/engine-health/…`, so it is never a
// self-copy (cf. staged-skills). Never overwrites a present vault note (a user may
// have edited it). Returns whether the vault note is present (for the caller's
// reindex pairing — a seeded-but-unindexed note would be a false `broken`).
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const STAGED_NOTE = "engine-health/health-check.md";
const VAULT_NOTE = "vault/engine-health/health-check.md";

export function seedHealthNote({ sourceDir, brainDir }) {
  const src = join(sourceDir, STAGED_NOTE);
  const dest = join(brainDir, VAULT_NOTE);
  if (existsSync(src) && !existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
  return { present: existsSync(dest) };
}
