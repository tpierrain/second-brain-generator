#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// health-probe-run.mjs — the DETACHED probe child (ADR 0028, F7). Spawned by
// session-health.mjs at SessionStart, it runs the functional health probes with
// the REAL seams (a live canary search, the vector store, the engine MCP handshake),
// persists the fresh verdict to engine-health.json, and OS-notifies the moment a
// capability becomes NEWLY broken. Runs in the background → session start never waits.
// ─────────────────────────────────────────────────────────────────────────────

export async function runProbeChild({ runProbes, readPriorVerdict, writeVerdict, notify }) {
  const verdict = runProbes();
  // Notify ONLY on a NEWLY broken capability (broken now AND not broken before) so a
  // still-broken capability never re-nags every session; a fresh break is loud once.
  const wasBroken = new Set(
    (readPriorVerdict() ?? []).filter((p) => p.status === "broken").map((p) => p.capability),
  );
  const newlyBroken = verdict.filter((p) => p.status === "broken" && !wasBroken.has(p.capability));
  writeVerdict(verdict);
  for (const probe of newlyBroken) notify(probe);
  return { verdict, newlyBroken };
}
