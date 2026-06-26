import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  applySchema,
  writeIndexIdentity,
  readIndexIdentity,
  readIndexSchemaVersion,
  indexDocumentIn,
  searchSimilarIn,
  getDocumentHashIn,
  listDocumentsIn,
  getStatsIn,
  removeDeletedDocsIn,
} from "./vector-store.js";

// Mutation hardening (Stryker, 2026-06-26): 33.8% → ~92%. The residual survivors
// are documented EQUIVALENT mutants, not test gaps:
//   - ragRoot() / rebuildBetterSqlite() (native-ABI rebuild path) — only runs on a
//     better-sqlite3 ABI mismatch, an environment we cannot provoke from a unit
//     test; the rebuild invocation itself is covered by native-deps.test.ts.
//   - getDb()'s `if (!db)` flipped to `if (true)` — harmless against a FILE-backed
//     DB: a fresh connection re-reads the same on-disk data, so behaviour is
//     preserved (only connection churn differs, not correctness).
//   - closeDb() — pure shutdown cleanup (db.close + null); the singleton handle is
//     module-private, so "is it closed?" has no unit-observable contract.
// Everything with an observable contract is killed below, incl. the getDb()
// singleton wrappers (vector-store.singleton.test.ts) and applySchema idempotency.

test("index_meta: identity round-trip (written at indexing time, read back afterwards)", () => {
  const db = new Database(":memory:");
  applySchema(db);

  const identity = {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  };
  writeIndexIdentity(db, identity);

  assert.deepEqual(readIndexIdentity(db), identity);
});

test("index_meta: schema-version round-trip (stamped at indexing time, read back)", () => {
  const db = new Database(":memory:");
  applySchema(db);

  writeIndexIdentity(
    db,
    { providerId: "gemini", model: "gemini-embedding-001", dimension: 3072 },
    7
  );

  assert.equal(readIndexSchemaVersion(db), 7);
});

test("index_meta: an index stamped before schema versioning reads back null", () => {
  const db = new Database(":memory:");
  applySchema(db);

  assert.equal(readIndexSchemaVersion(db), null);
});

test("index_meta: an unstamped index reads back a null identity", () => {
  const db = new Database(":memory:");
  applySchema(db);

  assert.equal(readIndexIdentity(db), null);
});

function columnNames(db: Database.Database, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((c) => c.name);
}

test("documents: applySchema provides a source_url column (clickable Notion link)", () => {
  const db = new Database(":memory:");
  applySchema(db);

  assert.ok(columnNames(db, "documents").includes("source_url"));
});

test("source_url round-trips from indexDocument to searchSimilar", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(
    db,
    "mirrors/facture/a.md",
    "A note",
    "note",
    [],
    "h1",
    [{ section: "S", content: "hello", chunkIndex: 0, embedding: [1, 0, 0] }],
    "https://www.notion.so/abc"
  );

  const results = searchSimilarIn(db, [1, 0, 0], 5);

  assert.equal(results[0].sourceUrl, "https://www.notion.so/abc");
});

test("a note without a source_url reads back null (grandfathered / non-mirror)", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "notes/plain.md", "Plain", "note", [], "h2", [
    { section: "S", content: "world", chunkIndex: 0, embedding: [1, 0, 0] },
  ]);

  const results = searchSimilarIn(db, [1, 0, 0], 5);

  assert.equal(results[0].sourceUrl, null);
});

// --- cosineSimilarity (exercised through searchSimilarIn) ---------------------
// Two cases pin every arithmetic/assignment term: identical vectors must score
// exactly 1, and an asymmetric pair must score the hand-computed cosine.

test("cosineSimilarity: identical query and embedding score exactly 1", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "n.md", "N", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [3, 4] },
  ]);

  const [hit] = searchSimilarIn(db, [3, 4], 5);

  assert.ok(Math.abs(hit.score - 1) < 1e-6, `expected ~1, got ${hit.score}`);
});

test("cosineSimilarity: asymmetric vectors score the exact cosine (4/5)", () => {
  const db = new Database(":memory:");
  applySchema(db);
  // query [1,2] · stored [2,1] = 4 ; |q|=|s|=√5 → 4/(√5·√5) = 0.8.
  // Asymmetric on purpose: distinguishes `+=` from `=` (which keeps the last
  // term only) and `*` from `/` in dot/norm accumulation.
  indexDocumentIn(db, "n.md", "N", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [2, 1] },
  ]);

  const [hit] = searchSimilarIn(db, [1, 2], 5);

  assert.ok(Math.abs(hit.score - 0.8) < 1e-6, `expected 0.8, got ${hit.score}`);
});

// --- getDocumentHashIn --------------------------------------------------------

test("getDocumentHashIn: returns the stored hash for a known doc", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "n.md", "N", "note", [], "deadbeef", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  assert.equal(getDocumentHashIn(db, "n.md"), "deadbeef");
});

test("getDocumentHashIn: returns null for an unknown doc", () => {
  const db = new Database(":memory:");
  applySchema(db);

  assert.equal(getDocumentHashIn(db, "missing.md"), null);
});

// --- listDocumentsIn ----------------------------------------------------------

function seedDocs(db: Database.Database): void {
  indexDocumentIn(db, "b.md", "B", "note", ["x"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "a.md", "A", "person", ["y"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
}

test("listDocumentsIn: returns every doc ordered by path", () => {
  const db = new Database(":memory:");
  applySchema(db);
  seedDocs(db);

  assert.deepEqual(
    listDocumentsIn(db).map((d) => d.path),
    ["a.md", "b.md"]
  );
});

test("listDocumentsIn: typeFilter narrows to a single type", () => {
  const db = new Database(":memory:");
  applySchema(db);
  seedDocs(db);

  assert.deepEqual(
    listDocumentsIn(db, "person").map((d) => d.path),
    ["a.md"]
  );
});

test("listDocumentsIn: tagFilter narrows to docs carrying the tag", () => {
  const db = new Database(":memory:");
  applySchema(db);
  seedDocs(db);

  assert.deepEqual(
    listDocumentsIn(db, undefined, "x").map((d) => d.path),
    ["b.md"]
  );
});

test("listDocumentsIn: type AND tag filters combine (both clauses required)", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "match.md", "M", "person", ["teamA"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "type-only.md", "T", "person", ["teamB"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "tag-only.md", "G", "note", ["teamA"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  assert.deepEqual(
    listDocumentsIn(db, "person", "teamA").map((d) => d.path),
    ["match.md"]
  );
});

// --- getStatsIn ---------------------------------------------------------------

test("getStatsIn: counts docs and chunks and ranks types by frequency", () => {
  const db = new Database(":memory:");
  applySchema(db);
  // two notes, one person → types ranked note(2) before person(1).
  indexDocumentIn(db, "n1.md", "N1", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
    { section: "S", content: "c", chunkIndex: 1, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "n2.md", "N2", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "p.md", "P", "person", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  const stats = getStatsIn(db);

  assert.equal(stats.docCount, 3);
  assert.equal(stats.chunkCount, 4);
  assert.deepEqual(stats.types, [
    { type: "note", n: 2 },
    { type: "person", n: 1 },
  ]);
});

// --- removeDeletedDocsIn ------------------------------------------------------

test("removeDeletedDocsIn: deletes docs absent from the existing set, with their chunks", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "keep.md", "K", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "gone.md", "G", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  const removed = removeDeletedDocsIn(db, new Set(["keep.md"]));

  assert.equal(removed, 1);
  assert.deepEqual(
    listDocumentsIn(db).map((d) => d.path),
    ["keep.md"]
  );
  // the orphaned chunk is gone too (no result for the deleted doc).
  assert.equal(searchSimilarIn(db, [1, 0], 5).length, 1);
});

test("removeDeletedDocsIn: removes nothing when every doc still exists", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "a.md", "A", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  assert.equal(removeDeletedDocsIn(db, new Set(["a.md"])), 0);
  assert.equal(listDocumentsIn(db).length, 1);
});

// --- searchSimilarIn: ranking, limit and filters ------------------------------

function seedRanked(db: Database.Database): void {
  // Against query [1,0]: a→1, b→1/√2≈0.707, c→0 (strictly decreasing).
  // Inserted in a DELIBERATELY un-sorted order (c, a, b) so that dropping the
  // sort (or neutering its comparator) leaves the rows in insertion order and the
  // assertion fails — otherwise a no-op sort would pass on already-ordered rows.
  indexDocumentIn(db, "c.md", "C", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [0, 1] },
  ]);
  indexDocumentIn(db, "a.md", "A", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "b.md", "B", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 1] },
  ]);
}

test("searchSimilarIn: results are ordered by descending score", () => {
  const db = new Database(":memory:");
  applySchema(db);
  seedRanked(db);

  const results = searchSimilarIn(db, [1, 0], 5);

  assert.deepEqual(
    results.map((r) => r.path),
    ["a.md", "b.md", "c.md"]
  );
});

test("searchSimilarIn: limit keeps only the top-N hits", () => {
  const db = new Database(":memory:");
  applySchema(db);
  seedRanked(db);

  const results = searchSimilarIn(db, [1, 0], 2);

  assert.deepEqual(
    results.map((r) => r.path),
    ["a.md", "b.md"]
  );
});

test("searchSimilarIn: typeFilter keeps only matching-type docs", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "note.md", "N", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "person.md", "P", "person", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  const results = searchSimilarIn(db, [1, 0], 5, "person");

  assert.deepEqual(
    results.map((r) => r.path),
    ["person.md"]
  );
});

test("searchSimilarIn: tagFilter keeps only docs carrying the tag", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "tagged.md", "T", "note", ["projectX"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  indexDocumentIn(db, "plain.md", "P", "note", [], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  const results = searchSimilarIn(db, [1, 0], 5, undefined, "projectX");

  assert.deepEqual(
    results.map((r) => r.path),
    ["tagged.md"]
  );
});

test("searchSimilarIn: type AND tag filters combine (both clauses required)", () => {
  const db = new Database(":memory:");
  applySchema(db);
  indexDocumentIn(db, "match.md", "M", "person", ["teamA"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  // Right type, wrong tag — excluded only if the two clauses are AND-combined.
  indexDocumentIn(db, "type-only.md", "T", "person", ["teamB"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);
  // Right tag, wrong type — same.
  indexDocumentIn(db, "tag-only.md", "G", "note", ["teamA"], "h", [
    { section: "S", content: "c", chunkIndex: 0, embedding: [1, 0] },
  ]);

  const results = searchSimilarIn(db, [1, 0], 5, "person", "teamA");

  assert.deepEqual(
    results.map((r) => r.path),
    ["match.md"]
  );
});

test("documents: applySchema migrates a pre-source_url table out of band", () => {
  const db = new Database(":memory:");
  // A brain indexed before this column existed: CREATE IF NOT EXISTS is a no-op,
  // so the column must be added out of band (like index_schema_version).
  db.exec(`
    CREATE TABLE documents (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  applySchema(db);

  assert.ok(columnNames(db, "documents").includes("source_url"));
});

test("applySchema is idempotent: a second run adds no duplicate column", () => {
  const db = new Database(":memory:");
  applySchema(db);

  // The out-of-band ALTERs are guarded by hasColumn; without the guard a second
  // run would throw "duplicate column". This pins the guard (kills if→true and
  // the column-name literal) AND documents the real idempotency contract: getDb
  // and a reindex can both call applySchema on the same DB.
  assert.doesNotThrow(() => applySchema(db));
  assert.equal(
    columnNames(db, "index_meta").filter((c) => c === "index_schema_version")
      .length,
    1
  );
});

test("index_meta: applySchema migrates a pre-version table out of band", () => {
  const db = new Database(":memory:");
  // A brain whose index_meta predates schema versioning: CREATE IF NOT EXISTS is
  // a no-op, so the index_schema_version column must be added out of band.
  db.exec(`
    CREATE TABLE index_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL
    );
  `);

  applySchema(db);

  assert.ok(columnNames(db, "index_meta").includes("index_schema_version"));
});
