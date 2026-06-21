import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthCheck, gatherVitals, runHealthCheck, type HealthVitals } from "./health-check.js";

const HEALTHY: HealthVitals = {
  embedderMode: "in-process",
  keyConfigured: true,
  embedderReady: true,
  indexRows: 42,
  canaryHits: 3,
  canaryNotePresent: true,
};

function checkNamed(result: { checks: { name: string; status: string }[] }, name: string) {
  const entry = result.checks.find((c) => c.name === name);
  assert.ok(entry, `expected a "${name}" check`);
  return entry;
}

test("all vitals healthy → aggregate status ok, every check ok", () => {
  const result = buildHealthCheck(HEALTHY);
  assert.equal(result.status, "ok");
  assert.ok(result.checks.length >= 3);
  assert.ok(result.checks.every((c) => c.status === "ok"));
});

test("embedder ran but canary not found → canary broken, aggregate broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, embedderReady: true, canaryHits: 0 });
  assert.equal(checkNamed(result, "canary").status, "broken");
  assert.equal(result.status, "broken");
});

test("embedder could not run → canary unknown (not broken), embedder broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, embedderReady: false, canaryHits: 0 });
  // We cannot conclude the RAG is broken when the search itself never ran.
  assert.equal(checkNamed(result, "canary").status, "unknown");
  assert.equal(checkNamed(result, "embedder").status, "broken");
});

test("dedicated health-check note absent → canary unknown (not broken), even with embedder ready", () => {
  // A purged/missing engine-health note must NOT be read as a broken RAG: we simply
  // cannot run the canary, so the verdict is "unknown" — never a scary false alarm.
  const result = buildHealthCheck({ ...HEALTHY, canaryNotePresent: false, canaryHits: 0 });
  assert.equal(checkNamed(result, "canary").status, "unknown");
  assert.equal(result.status, "unknown");
});

test("gatherVitals: canaryNoteExists seam wired → canaryNotePresent captured", async () => {
  const present = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 12,
    searchCanary: async () => 4,
    canaryNoteExists: () => true,
  });
  assert.equal(present.canaryNotePresent, true);

  const absent = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 12,
    searchCanary: async () => 0,
    canaryNoteExists: () => false,
  });
  assert.equal(absent.canaryNotePresent, false);
});

test("index unreadable (rows < 0) → index unknown, not broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, indexRows: -1 });
  assert.equal(checkNamed(result, "index").status, "unknown");
});

test("index empty (0 rows) → index broken", () => {
  const result = buildHealthCheck({ ...HEALTHY, indexRows: 0 });
  assert.equal(checkNamed(result, "index").status, "broken");
});

test("API mode with no key configured → embedder unknown, not broken", () => {
  const result = buildHealthCheck({
    ...HEALTHY,
    embedderMode: "gemini",
    keyConfigured: false,
    embedderReady: false,
  });
  // A missing API key is the separately-handled state, never a scary "broken".
  assert.equal(checkNamed(result, "embedder").status, "unknown");
});

test("gatherVitals: canary search resolves → embedderReady true, hits captured", async () => {
  const vitals = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 12,
    searchCanary: async () => 4,
    canaryNoteExists: () => true,
  });
  assert.equal(vitals.embedderReady, true);
  assert.equal(vitals.canaryHits, 4);
  assert.equal(vitals.indexRows, 12);
});

test("gatherVitals: a throwing index read → indexRows -1 (unreadable sentinel)", async () => {
  const vitals = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => {
      throw new Error("db locked");
    },
    searchCanary: async () => 1,
    canaryNoteExists: () => true,
  });
  assert.equal(vitals.indexRows, -1);
});

test("runHealthCheck: composes gather + build → healthy seams give ok", async () => {
  const result = await runHealthCheck({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 7,
    searchCanary: async () => 2,
    canaryNoteExists: () => true,
  });
  assert.equal(result.status, "ok");
});

test("buildHealthCheck light snapshot (canaryHits null = not searched) → canary ok, not a false broken", () => {
  // At light depth the search never runs, so canaryHits is null (not 0). A note present
  // on disk + sound index/embedder must NOT be read as a broken canary just because we
  // did not search — that would be the very false alarm F7-ter exists to avoid.
  const result = buildHealthCheck({
    embedderMode: "in-process",
    keyConfigured: true,
    embedderReady: true,
    indexRows: 42,
    canaryHits: null,
    canaryNotePresent: true,
  });
  assert.equal(checkNamed(result, "canary").status, "ok");
  assert.equal(result.status, "ok");
});

test("gatherVitals light: canaryHits null (unmeasured) + embedderReady from weightsReady seam", async () => {
  const ready = await gatherVitals(
    {
      embedderMode: "in-process",
      keyConfigured: true,
      readIndexRows: () => 12,
      searchCanary: async () => 4,
      canaryNoteExists: () => true,
      weightsReady: () => true,
    },
    "light",
  );
  assert.equal(ready.canaryHits, null);
  assert.equal(ready.embedderReady, true);

  const noWeights = await gatherVitals(
    {
      embedderMode: "in-process",
      keyConfigured: true,
      readIndexRows: () => 12,
      searchCanary: async () => 4,
      canaryNoteExists: () => true,
      weightsReady: () => false,
    },
    "light",
  );
  assert.equal(noWeights.embedderReady, false);
});

test("gatherVitals light depth never runs the canary search (zero ONNX, zero embed)", async () => {
  // F7-ter / ADR 0030 §6: the per-session background probe reads file/DB state only.
  // It must NEVER embed or search — that is the full-depth (verify-rag) job.
  let searched = false;
  await gatherVitals(
    {
      embedderMode: "in-process",
      keyConfigured: true,
      readIndexRows: () => 12,
      searchCanary: async () => {
        searched = true;
        return 4;
      },
      canaryNoteExists: () => true,
      weightsReady: () => true,
    },
    "light",
  );
  assert.equal(searched, false);
});

test("runHealthCheck light depth: composes gather(light)+build, never searches, healthy → ok", async () => {
  let searched = false;
  const result = await runHealthCheck(
    {
      embedderMode: "in-process",
      keyConfigured: true,
      readIndexRows: () => 7,
      searchCanary: async () => {
        searched = true;
        return 2;
      },
      canaryNoteExists: () => true,
      weightsReady: () => true,
    },
    "light",
  );
  assert.equal(searched, false);
  assert.equal(result.status, "ok");
});

test("gatherVitals: a throwing canary search → embedderReady false, 0 hits", async () => {
  const vitals = await gatherVitals({
    embedderMode: "in-process",
    keyConfigured: true,
    readIndexRows: () => 12,
    searchCanary: async () => {
      throw new Error("embedder boom");
    },
    canaryNoteExists: () => true,
  });
  assert.equal(vitals.embedderReady, false);
  assert.equal(vitals.canaryHits, 0);
});
