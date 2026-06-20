// ─────────────────────────────────────────────────────────────────────────────
// health-activation.mjs — the pure selector for "only ACTIVATED modules are
// checked" (ADR 0030, F7-bis). Activation = presence in the brain's .mcp.json.
// The manifest tags each engine module mandatory | optional; this selector decides,
// per module, whether to run its health_check (registered), report it broken
// (mandatory but absent — can't ping a server that isn't wired), or skip it silently
// (optional and absent — no false alarm for a mirror nobody set up).
//
// Pure & injectable (no fs / no JSON parsing) so it is trivially testable: the wrapper
// feeds it a real `isRegistered` predicate over the brain's .mcp.json.
// ─────────────────────────────────────────────────────────────────────────────

export function selectModulesToCheck({ manifest, isRegistered }) {
  const requirements = manifest.engineModuleRequirements ?? {};
  const toCheck = [];
  const brokenMissing = [];
  const skipped = [];
  for (const id of manifest.engineMcpServers ?? []) {
    if (isRegistered(id)) {
      toCheck.push(id);
    } else if (requirements[id] === "mandatory") {
      brokenMissing.push(id);
    } else {
      skipped.push(id);
    }
  }
  return { toCheck, brokenMissing, skipped };
}
