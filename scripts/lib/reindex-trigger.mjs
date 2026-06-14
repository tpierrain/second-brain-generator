// ─────────────────────────────────────────────────────────────────────────────
// reindex-trigger.mjs — the deterministic "must we reindex?" decision (plan Step 5,
// ADR 0009: prefer a verifiable condition over a guess). After update-engine swaps
// the engine, the existing index stays valid AS LONG AS the index format did not
// move; reindexing is expensive (ONNX, minutes), so we run it ONLY when the target's
// `indexSchemaVersion` differs from the brain's. Pure: two manifests in, a boolean
// out. The confirm UX + the actual reindex run live elsewhere (the Step 6 skill /
// the core's injected `runReindex` seam).
// ─────────────────────────────────────────────────────────────────────────────

// True iff the brain must reindex: the target's index format differs from what the
// brain's current index was built against. A brain that predates schema stamping
// (`undefined` local) differs from any declared target → reindex (the safe call).
export function needsReindex({ local, target }) {
  return target?.indexSchemaVersion !== local?.indexSchemaVersion;
}
