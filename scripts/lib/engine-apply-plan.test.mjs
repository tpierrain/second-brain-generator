import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { computeApplyPlan, planTouches } from "./engine-apply-plan.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// engine-apply-plan — THE SAFETY CORE (plan Step 3). A pure function turning the
// fetched target manifest's regimes into a WRITE-ALLOWLIST (ADR 0003/0012): the
// engine only ever writes files it declares it owns — `replace` (overwrite),
// `regenerate` (launchers) and the engine-owned `merge` *scripts* (scripts/*.mjs,
// incl. update-engine.mjs → self-update). Everything else — CLAUDE.md, settings,
// any .claude/skills/**, the vault, .env — is untouchable BY CONSTRUCTION, and a
// sacred scrub defends even against a buggy/hostile manifest. No filesystem.
// ═══════════════════════════════════════════════════════════════════════════

test("computeApplyPlan — the target's `replace` regime becomes the `overwrite` bucket", () => {
  const target = { regimes: { replace: ["rag/src/**", "rag/package.json"] } };
  assert.deepEqual(computeApplyPlan(target).overwrite, ["rag/src/**", "rag/package.json"]);
});

test("computeApplyPlan — the target's `regenerate` regime becomes the `regenerate` bucket", () => {
  const target = { regimes: { regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"] } };
  assert.deepEqual(computeApplyPlan(target).regenerate, [
    "rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd",
  ]);
});

test("computeApplyPlan — `replaceScripts` = the engine-owned merge scripts (scripts/*.mjs), incl. self-update; user merge files excluded", () => {
  const target = {
    regimes: {
      merge: [
        "CLAUDE.md",                      // user-sovereign → excluded
        ".claude/settings.json",          // user-sovereign → excluded
        ".claude/skills/coach/**",        // a shipped skill → out of v1 scope (excluded)
        "scripts/auto-commit.mjs",
        "scripts/auto-push.mjs",
        "scripts/status-line.mjs",
        "scripts/verify-rag.mjs",
        "scripts/update-engine.mjs",      // self-update → MUST be present
      ],
    },
  };
  assert.deepEqual(computeApplyPlan(target).replaceScripts, [
    "scripts/auto-commit.mjs",
    "scripts/auto-push.mjs",
    "scripts/status-line.mjs",
    "scripts/verify-rag.mjs",
    "scripts/update-engine.mjs",
  ]);
});

test("computeApplyPlan — manifest-declared engine skills (.claude/skills/<name>/**) become the `installSkills` bucket", () => {
  const target = {
    regimes: {
      merge: [
        "CLAUDE.md",                          // user-sovereign → not a skill
        ".claude/settings.json",              // user-sovereign → not a skill
        ".claude/skills/local-mirror/**",     // an engine-owned skill → installSkills
        "scripts/auto-commit.mjs",            // an engine script → replaceScripts, not a skill
      ],
    },
  };
  assert.deepEqual(computeApplyPlan(target).installSkills, [".claude/skills/local-mirror/**"]);
});

test("computeApplyPlan — SAFETY: a skill can ONLY be delivered additively; mis-declared in `replace`/`regenerate` it is scrubbed (never overwritten)", () => {
  const hostile = {
    regimes: {
      replace: ["rag/src/**", ".claude/skills/local-mirror/**"],  // try to OVERWRITE a skill
      regenerate: [".claude/skills/coach/**"],                     // try to clobber via regenerate
      merge: [".claude/skills/local-mirror/**"],                   // the legit additive declaration
    },
  };
  const plan = computeApplyPlan(hostile);
  assert.deepEqual(plan.overwrite, ["rag/src/**"], "a skill in `replace` is scrubbed — never overwritten");
  assert.deepEqual(plan.regenerate, [], "a skill in `regenerate` is scrubbed");
  assert.deepEqual(plan.installSkills, [".claude/skills/local-mirror/**"], "only the additive merge path carries skills");
});

// A realistic full target manifest, reused by the guard tests below.
function fullTarget() {
  return {
    regimes: {
      replace: ["rag/src/**", "rag/package.json", "rag/package-lock.json", "rag/tsconfig.json"],
      regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
      merge: [
        "CLAUDE.md", ".claude/settings.json",
        ".claude/skills/coach/**", ".claude/skills/sync/**",
        "scripts/auto-commit.mjs", "scripts/auto-push.mjs",
        "scripts/status-line.mjs", "scripts/verify-rag.mjs", "scripts/update-engine.mjs",
      ],
    },
  };
}

test("computeApplyPlan — the three buckets are disjoint (no entry written by two actions)", () => {
  const { overwrite, regenerate, replaceScripts } = computeApplyPlan(fullTarget());
  const all = [...overwrite, ...regenerate, ...replaceScripts];
  assert.equal(new Set(all).size, all.length, "an engine file must be claimed by exactly one action");
});

test("computeApplyPlan — SAFETY CORE: a manifest mis-declaring a sacred file as engine-owned is scrubbed", () => {
  // A buggy/hostile target manifest tries to smuggle user-sovereign files into the
  // engine regimes. The plan must refuse them regardless of what the manifest says.
  const hostile = {
    regimes: {
      replace: ["rag/src/**", "CLAUDE.md", ".env"],
      regenerate: [".claude/settings.json", "rag/launch.sh"],
      merge: ["scripts/auto-commit.mjs", ".claude/skills/coach/**"],
    },
  };
  const plan = computeApplyPlan(hostile);
  assert.deepEqual(plan.overwrite, ["rag/src/**"], "CLAUDE.md and .env scrubbed from overwrite");
  assert.deepEqual(plan.regenerate, ["rag/launch.sh"], ".claude/settings.json scrubbed from regenerate");
  assert.deepEqual(plan.replaceScripts, ["scripts/auto-commit.mjs"], "skills never reach replaceScripts");
});

// ─── SELF-CARRY guard (plan Step 4) ─────────────────────────────────────────
// The engine must replace its OWN machinery on an upgrade, or a brain installed by
// this PR can never be cleanly upgraded: the core would land but its libs would stay
// stale → an incoherent engine. So the SHIPPED engine-manifest.json must declare
// `scripts/update-engine.mjs` AND every `scripts/lib/**` the core imports as Engine-
// owned, and the plan derived from it must `planTouches`-cover them.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function shippedManifest() {
  return JSON.parse(readFileSync(resolve(repoRoot, "engine-manifest.json"), "utf8"));
}

test("SELF-CARRY — the plan covers update-engine + every lib the core depends on (else a brain can't be upgraded)", () => {
  const plan = computeApplyPlan(shippedManifest());
  // The core (scripts/update-engine.mjs) and the libs it imports. The engine fully
  // replaces itself, libs included — otherwise an upgrade swaps the core but leaves
  // these behind.
  for (const engineFile of [
    "scripts/update-engine.mjs",
    "scripts/lib/engine-fetch.mjs",
    "scripts/lib/engine-apply-plan.mjs",
    "scripts/lib/engine-source.mjs",
    "scripts/lib/reindex-trigger.mjs",
    "scripts/lib/glob-match.mjs",
    "scripts/lib/fs-walk.mjs",
    "scripts/lib/rag-launcher.mjs",
  ]) {
    assert.equal(
      planTouches(plan, engineFile),
      true,
      `the engine must self-carry ${engineFile} (declare it Engine-owned in engine-manifest.json) or an upgrade leaves it stale`,
    );
  }
});

test("planTouches — NEVER touches the user's files; DOES touch the engine's", () => {
  const plan = computeApplyPlan(fullTarget());

  // The sacred set — not one of these may be matched by any plan glob.
  for (const userPath of [
    "vault/topics/flemmr.md",
    "vault/backlog/some deep/note.md",
    ".claude/skills/coach/SKILL.md",
    ".claude/skills/zzz-mine/SKILL.md",
    "CLAUDE.md",
    ".claude/settings.json",
    ".env",
  ]) {
    assert.equal(planTouches(plan, userPath), false, `the plan must NOT touch ${userPath}`);
  }

  // Engine files the allowlist legitimately covers (globs resolved here).
  for (const enginePath of [
    "rag/src/index.ts",
    "rag/src/lib/embedder.ts",
    "rag/package.json",
    "rag/launch.sh",
    "scripts/run-node.cmd",
    "scripts/auto-commit.mjs",
    "scripts/update-engine.mjs",
  ]) {
    assert.equal(planTouches(plan, enginePath), true, `the plan MUST cover ${enginePath}`);
  }
});
