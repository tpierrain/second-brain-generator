import { test } from "node:test";
import assert from "node:assert/strict";

import { needsReindex } from "./reindex-trigger.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// reindex-trigger — the deterministic "must we reindex?" decision update-engine
// makes after a swap (plan Step 5). An existing index stays valid as long as the
// index format (indexSchemaVersion) did not move; reindexing is expensive (ONNX,
// minutes) so we do it ONLY when the target's schema differs from the brain's.
// Pure: the brain + target manifests in, a boolean out. The confirm UX + the real
// reindex run live elsewhere (the skill / the injected seam).
// ═══════════════════════════════════════════════════════════════════════════

test("stale — the target's index schema moved → reindex", () => {
  assert.equal(
    needsReindex({ local: { indexSchemaVersion: 1 }, target: { indexSchemaVersion: 2 } }),
    true,
  );
});

test("fresh — the index schema is unchanged → skip the (expensive) reindex", () => {
  assert.equal(
    needsReindex({ local: { indexSchemaVersion: 2 }, target: { indexSchemaVersion: 2 } }),
    false,
  );
});

test("pre-stamp brain — no recorded schema vs a declared target → reindex (the safe call)", () => {
  assert.equal(
    needsReindex({ local: {}, target: { indexSchemaVersion: 1 } }),
    true,
  );
});
