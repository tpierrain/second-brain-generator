import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { matchesAny } from "./glob-match.mjs";
import { selectModulesToCheck } from "./health-activation.mjs";

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

// The reverse guard: an engine-owned script wired as a SessionStart hook but ABSENT
// from the manifest is the "update-engine must self-carry its libs" bug class — the
// brain runs it, yet an upgrade never refreshes it (settings.json is sacred/merge, so
// the hook stays wired, pointing at a stale script). Every SessionStart hook script
// must be carried (declared in replace/regenerate; merge would be wrong for these).
test("engine-manifest — every SessionStart hook script is carried to upgraders (declared in replace/regenerate)", () => {
  const settings = JSON.parse(
    readFileSync(join(repoRoot, ".claude", "settings.json.template"), "utf8"),
  );
  const hookScripts = [
    ...new Set(
      (settings.hooks?.SessionStart ?? [])
        .flatMap((entry) => entry.hooks.map((h) => h.command))
        .flatMap((cmd) => cmd.match(/scripts\/[\w.-]+\.mjs/g) ?? []),
    ),
  ];
  const carryGlobs = [...(manifest.regimes.replace ?? []), ...(manifest.regimes.regenerate ?? [])];
  const undeclared = hookScripts.filter((rel) => !carryGlobs.some((glob) => matchesAny([glob], rel)));
  assert.deepEqual(
    undeclared,
    [],
    `SessionStart hook scripts not carried by the manifest (upgraders keep stale copies): ${undeclared.join(", ")}`,
  );
});

// F-B2 (ADR 0026): settings.json.template must be CARRIED to upgraders (declared in
// `replace`). It is the desired-state SOURCE the hook reconcile / SessionStart bootstrap
// tick reads to detect drift — a brain comparing its settings.json against its OWN STALE
// template would see no gap and never wire the v3.3.0 runtime hooks. (The generated
// settings.json itself stays SACRED/merge; only its engine-owned template is shipped.)
test("engine-manifest — settings.json.template is carried to upgraders (the hook-reconcile desired-state source)", () => {
  const carried = (manifest.regimes.replace ?? []).some((glob) =>
    matchesAny([glob], ".claude/settings.json.template"),
  );
  assert.ok(
    carried,
    "`.claude/settings.json.template` must be in `replace` so upgraders get the new SessionStart entries (F-B2 bootstrap)",
  );
});

// The health-check activation policy (ADR 0030, F7-bis) reads engineModuleRequirements ×
// the brain's .mcp.json. vault-rag is the brain's load-bearing module: if it ever silently
// loses its `mandatory` tag, a vault-rag absent from .mcp.json would no longer be flagged
// broken (it'd default to optional → skipped). Lock the real manifest against that drift.
test("engine-manifest — vault-rag is tagged mandatory, so an absent vault-rag is flagged broken", () => {
  const verdict = selectModulesToCheck({ manifest, isRegistered: () => false });
  assert.ok(
    verdict.brokenMissing.includes("vault-rag"),
    "vault-rag must be mandatory: an unregistered vault-rag has to surface as broken, not be skipped",
  );
});

// Pre-ship belt (Thomas, 2026-06-21): the rig repoints a DISPOSABLE brain's manifest
// `source` at a LOCAL bare repo + a branch ref (e.g. /Users/…/qa-v33-src.git) so
// /update-engine pulls the not-yet-pushed work. That QA pointer must NEVER leak into the
// COMMITTED launcher manifest: a generated brain derives its source from the launcher's
// `git remote get-url origin` at install time (installer.mjs), so the launcher manifest
// must carry NO `source` at all. A committed `source` — especially a local filesystem path
// or a non-GitHub ref — would make a shipped brain try to pull from a repo that only exists
// on the maintainer's machine. This guard fails loud if that QA trace is ever committed.
test("engine-manifest — the committed launcher manifest pins NO `source` (no QA repo/ref leak)", () => {
  assert.equal(
    manifest.source,
    undefined,
    "the launcher manifest must not pin a `source`; the installer injects the GitHub origin per-brain. " +
      "A committed source is almost certainly a leaked QA repoint (local bare repo / branch ref) — remove it.",
  );
});
