import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Exercises the getDb() SINGLETON path end-to-end (real better-sqlite3, real
// on-disk file) — the only way to kill the thin `return fooIn(getDb(), …)`
// wrappers that the in-memory *In tests cannot reach. The DB location is rooted
// at a throwaway temp dir via CACHE_DIR, which config.ts freezes into DB_PATH at
// import time; hence the env MUST be set BEFORE importing the module, and the
// import MUST be dynamic (a static import is hoisted ahead of this line).
const cacheDir = mkdtempSync(join(tmpdir(), "vs-singleton-"));
process.env.CACHE_DIR = cacheDir;

const vs = await import("./vector-store.js");

after(() => {
  vs.closeDb();
  rmSync(cacheDir, { recursive: true, force: true });
});

test("singleton: stamp then read identity round-trips through getDb()", () => {
  vs.stampIndexIdentity({ providerId: "gemini", model: "m", dimension: 7 });

  assert.deepEqual(vs.currentIndexIdentity(), {
    providerId: "gemini",
    model: "m",
    dimension: 7,
  });
  assert.equal(vs.currentIndexSchemaVersion(), vs.INDEX_SCHEMA_VERSION);
});

test("singleton: index → hash, search, list, stats, remove via getDb()", () => {
  vs.indexDocument(
    "doc.md",
    "Doc",
    "note",
    ["t"],
    "hh",
    [{ section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] }],
    "https://x"
  );

  assert.equal(vs.getDocumentHash("doc.md"), "hh");

  const hits = vs.searchSimilar([1, 0], 5, { universe: "default" });
  assert.equal(hits[0].path, "doc.md");
  assert.equal(hits[0].sourceUrl, "https://x");

  assert.equal(vs.listDocuments().length, 1);
  assert.equal(vs.getStats().docCount, 1);

  // Absent from the existing set → removed, and the store is empty afterwards.
  assert.equal(vs.removeDeletedDocs(new Set<string>()), 1);
  assert.equal(vs.listDocuments().length, 0);
});
