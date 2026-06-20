// ─────────────────────────────────────────────────────────────────────────────
// health-check-runner.mjs — the shared orchestration behind all three health-check
// callers (ADR 0030, F7-bis): the installer post-flight, verify-rag.mjs, and the
// runtime SessionStart probe. It picks the ACTIVATED modules (selectModulesToCheck),
// calls each module's standard MCP `health_check`, and aggregates the per-module
// verdicts into one overall verdict.
//
// "Check in the module, policy in the caller" (ADR 0030): this runner only produces
// the verdict. The REACTION (exit 1 loud gate / exit 0 manual / detached notify on
// newly-broken) belongs to each caller. callHealthCheck is injected so the runner is
// pure & testable; the real seam wraps the MCP round-trip (mcp-smoke).
// ─────────────────────────────────────────────────────────────────────────────

import { selectModulesToCheck } from "./health-activation.mjs";

export async function runActivatedHealthChecks({ manifest, isRegistered, callHealthCheck }) {
  const { toCheck, brokenMissing } = selectModulesToCheck({ manifest, isRegistered });
  const modules = [];
  // A mandatory module absent from .mcp.json can't be pinged → surface it broken
  // (named) without an MCP round-trip; an optional absent module is skipped silently.
  for (const module of brokenMissing) {
    modules.push({
      module,
      status: "broken",
      checks: [{ name: "registration", status: "broken", detail: "not registered in .mcp.json" }],
    });
  }
  for (const module of toCheck) {
    // Fail-open (ADR 0028/0030): an unexpected round-trip throw → "unknown" (we
    // genuinely couldn't determine), never a thrown error out of the runner. The
    // seam itself maps a determined deadness (registered server that won't answer)
    // to a returned "broken"; only true surprises land here.
    try {
      const { status, checks } = await callHealthCheck(module);
      modules.push({ module, status, checks });
    } catch (err) {
      modules.push({
        module,
        status: "unknown",
        checks: [{ name: "health_check", status: "unknown", detail: `call failed: ${err.message}` }],
      });
    }
  }
  return { status: aggregate(modules.map((m) => m.status)), modules };
}

// One overall verdict from the per-module statuses (ADR 0030 §aggregate, mirroring
// rag's buildHealthCheck): any broken → broken; else any unknown → unknown; else ok.
function aggregate(statuses) {
  if (statuses.some((s) => s === "broken")) return "broken";
  if (statuses.some((s) => s === "unknown")) return "unknown";
  return "ok";
}
