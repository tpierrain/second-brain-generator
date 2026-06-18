import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { matchesAny } from "./glob-match.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// engine-manifest integrity — a structural guard over the REAL repo-root
// engine-manifest.json. The manifest is the inventory of engine-owned files
// (ADR 0003/0012): `replace` (overwrite), `merge` (3-way base / provenance) and
// `regenerate` (generated launchers). A renamed source dir or skill that silently
// drops out of the inventory is a latent bug — `update-engine`'s apply plan and
// the installer's provenance seed both resolve these globs against real files, so
// a dead glob means a file with no provenance base (Phase 2 merge gap). This guard
// catches exactly that class: every NON-generated glob must match ≥1 tracked file.
// ═══════════════════════════════════════════════════════════════════════════

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "engine-manifest.json"), "utf8"));
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

// `regenerate` launchers and `.claude/settings.json` are GENERATED at install
// (from .template / by the launcher self-heal), never tracked source → excluded.
const GENERATED = new Set([".claude/settings.json"]);

test("engine-manifest — every `replace`/`merge` glob resolves to a real tracked file (no dead inventory entries)", () => {
  const globs = [...(manifest.regimes.replace ?? []), ...(manifest.regimes.merge ?? [])].filter(
    (glob) => !GENERATED.has(glob),
  );
  const dead = globs.filter((glob) => !trackedFiles.some((file) => matchesAny([glob], file)));
  assert.deepEqual(dead, [], `manifest globs matching no tracked file (renamed/removed?): ${dead.join(", ")}`);
});
