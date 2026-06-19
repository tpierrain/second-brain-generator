// ─────────────────────────────────────────────────────────────────────────────
// engine-apply-plan.mjs — THE SAFETY CORE (plan Step 3). Pure: from the fetched
// target manifest it computes a WRITE-ALLOWLIST (ADR 0003/0012, the governing
// invariant) — the only files `update-engine` may write at Phase 1 Option 1:
//   • overwrite       ← the `replace` regime (rag engine code, package files)
//   • regenerate      ← the `regenerate` regime (the .sh/.cmd launchers)
//   • replaceScripts  ← the engine-owned `merge` scripts (scripts/*.mjs, INCLUDING
//                       update-engine.mjs itself → self-updating)
// Everything else (CLAUDE.md, .claude/settings.json, any .claude/skills/**, the
// vault, .env) is untouchable BY CONSTRUCTION (never in those regimes) — and a
// sacred scrub re-asserts it even if a buggy/hostile manifest mis-declares one.
// No filesystem here: globs are resolved to concrete files later, at apply (Step 4).
// ─────────────────────────────────────────────────────────────────────────────
import { matchesAny } from "./glob-match.mjs";

// An engine-owned script within the `merge` regime: a top-level scripts/*.mjs
// (auto-commit, auto-push, status-line, verify-rag, AND update-engine itself).
// The rest of `merge` — CLAUDE.md, .claude/settings.json, .claude/skills/** — is
// the user's, deliberately out of Phase 1 Option 1 scope.
const ENGINE_SCRIPT = /^scripts\/[^/]+\.mjs$/;

// An engine-owned SKILL within the `merge` regime: a `.claude/skills/<name>/**`
// entry the manifest declares (coach, local-mirror, …). These are carved OUT of the
// blanket skills scrub into an ADDITIVE install-if-absent bucket (ADR 0025): a
// brand-new engine skill reaches upgraders, while a custom/non-declared skill stays
// untouchable (it is never in the manifest) and an already-present one is preserved.
const ENGINE_SKILL = /^\.claude\/skills\/[^/]+\//;

// The user's sovereign territory — NEVER writable by the engine (ADR 0003/0012),
// whatever a manifest declares. Exact files + whole subtrees. The vault has no
// fixed manifest entry, but `vault/` is denied too as belt-and-suspenders.
const SACRED_FILES = ["CLAUDE.md", ".claude/settings.json", ".env"];
const SACRED_TREES = [".claude/skills/", "vault/"];

// The path stem of a (possibly glob) entry, for the sacred check: drop a trailing
// "/**" or "/*" so ".claude/skills/coach/**" is judged under ".claude/skills/".
function stem(entry) {
  return entry.replace(/\/\*\*?$/, "");
}

function isSacred(entry) {
  const s = stem(entry);
  return SACRED_FILES.includes(s) || SACRED_TREES.some((tree) => (s + "/").startsWith(tree));
}

// True iff the plan would write `relPath` — the never-touch oracle the guard tests
// and the apply step (Step 4) use to resolve globs against concrete files. Because
// the plan is an allowlist, this is false for every user file by construction.
export function planTouches(plan, relPath) {
  return matchesAny([...plan.overwrite, ...plan.regenerate, ...plan.replaceScripts], relPath);
}

export function computeApplyPlan(targetManifest) {
  const regimes = targetManifest?.regimes ?? {};
  const scrub = (entries) => entries.filter((entry) => !isSacred(entry));
  return {
    overwrite: scrub([...(regimes.replace ?? [])]),
    regenerate: scrub([...(regimes.regenerate ?? [])]),
    replaceScripts: scrub((regimes.merge ?? []).filter((entry) => ENGINE_SCRIPT.test(entry))),
    installSkills: (regimes.merge ?? []).filter((entry) => ENGINE_SKILL.test(entry)),
  };
}
