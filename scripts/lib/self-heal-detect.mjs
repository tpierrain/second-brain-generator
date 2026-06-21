// ─────────────────────────────────────────────────────────────────────────────
// self-heal-detect.mjs — the pure gate for the SessionStart self-heal (ADR 0026,
// Layer B). Decides whether a brain still has a convergence GAP: an engine-wanted
// skill not yet installed, or an engine-wanted MCP server not yet registered.
//
// Pure & injectable (no fs / no JSON parsing / no manifest read here) so the gate is
// trivially testable: the wrapper derives the DESIRED-STATE from the files the engine
// DELIVERS — `wantedSkillDirs` (engine merge skills ∪ staged `engine-skills/`) and
// `wantedServerIds` (keys of the delivered `.mcp.json.template`) — and feeds it in
// alongside the real `skillDirExists` / `mcpServerRegistered` predicates (F-B7 2g).
// Deriving desired-state from delivered files — NOT the frozen user manifest, which
// update-engine never refreshes — is what closes the pre-3.3.0 convergence gap.
//
// When it returns `needed === false`, the SessionStart hook is a TRUE no-op (it
// spawns nothing) → fast + idempotent in the steady state.
// ─────────────────────────────────────────────────────────────────────────────

export function detectSelfHealGap({
  wantedSkillDirs = [],
  wantedServerIds = [],
  skillDirExists,
  mcpServerRegistered,
}) {
  const missingSkills = wantedSkillDirs.filter((dir) => !skillDirExists(dir));
  const missingServers = wantedServerIds.filter((id) => !mcpServerRegistered(id));
  return {
    needed: missingSkills.length > 0 || missingServers.length > 0,
    missingSkills,
    missingServers,
  };
}
