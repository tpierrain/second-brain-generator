// ─────────────────────────────────────────────────────────────────────────────
// self-heal-detect.mjs — the pure gate for the SessionStart self-heal (ADR 0026,
// Layer B). Decides whether a brain still has a convergence GAP: an engine-declared
// skill not yet installed, or an engine MCP server not yet registered in .mcp.json.
//
// Pure & injectable (no fs / no JSON parsing here) so the gate is trivially
// testable: the wrapper feeds it real `skillDirExists` / `mcpServerRegistered`
// predicates. When it returns `needed === false`, the SessionStart hook is a TRUE
// no-op (it spawns nothing) → fast + idempotent in the steady state.
//
// #2 (code-review): the engine-declared skills are NOT a top-level manifest field —
// they live under `regimes.merge` and are derived by `computeApplyPlan`, exactly as
// reconcileBrain does. Reading a non-existent `manifest.installSkills` made
// missingSkills ALWAYS [] (a silent dead read). Derive from the real source.
// ─────────────────────────────────────────────────────────────────────────────
import { computeApplyPlan } from "./engine-apply-plan.mjs";

// "<…>/local-mirror/**" → "<…>/local-mirror" (mirror reconcile-brain's skill-dir derivation).
function skillGlobToDir(glob) {
  return glob.replace(/\/\*\*?$/, "");
}

export function detectSelfHealGap({ manifest, skillDirExists, mcpServerRegistered }) {
  const missingSkills = computeApplyPlan(manifest).installSkills
    .map(skillGlobToDir)
    .filter((dir) => !skillDirExists(dir));
  const missingServers = (manifest.engineMcpServers ?? []).filter((id) => !mcpServerRegistered(id));
  return {
    needed: missingSkills.length > 0 || missingServers.length > 0,
    missingSkills,
    missingServers,
  };
}
