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
} from "./vector-store.js";

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
