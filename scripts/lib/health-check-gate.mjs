// ─────────────────────────────────────────────────────────────────────────────
// health-check-gate.mjs — the LOUD-GATE policy shared by verify-rag.mjs + the
// installer post-flight (ADR 0030, F7-bis). The runtime SessionStart probe has a
// DIFFERENT reaction (notify on newly-broken), so it does NOT use this.
//
// Over runActivatedHealthChecks's per-module verdicts, it returns the modules that
// must block the gate (caller → exit 1, named). Policy (#3 code-review):
//   • `broken`  → block UNLESS the module is explicitly OPTIONAL. An optional module
//                 whose server can't boot (e.g. an unconfigured local-mirror on a fresh
//                 install — its npm install only warns) is a loud non-blocking warning,
//                 never a false install failure. A module with no declared requirement
//                 still gates (a proven break defaults to mandatory, belt-and-suspenders).
//   • `unknown` → block ONLY on an explicitly MANDATORY module (we can't PROVE the
//                 mandatory capability works). An undetermined optional/unspecified
//                 module is benign → never blocks (no cry-wolf).
// The asymmetry is deliberate: a PROVEN break is worse than an UNDETERMINED state, so
// the default (unspecified requirement) blocks on broken but not on unknown.
//
// The caller (verify-rag / installer post-flight) must still PRINT a non-blocking
// optional `broken` loudly via `optionalBroken` so it stays visible.
// ─────────────────────────────────────────────────────────────────────────────

export function gateBlockers(result, manifest) {
  const requirements = manifest.engineModuleRequirements ?? {};
  return result.modules.filter((m) => {
    const requirement = requirements[m.module];
    if (m.status === "broken") return requirement !== "optional";
    if (m.status === "unknown") return requirement === "mandatory";
    return false;
  });
}

// The optional modules that are broken — NOT gate blockers, but the caller should still
// surface them loudly (an optional capability is degraded; the user deserves to know).
export function optionalBroken(result, manifest) {
  const requirements = manifest.engineModuleRequirements ?? {};
  return result.modules.filter(
    (m) => m.status === "broken" && requirements[m.module] === "optional",
  );
}
