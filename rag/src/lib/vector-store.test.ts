import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  applySchema,
  writeIndexIdentity,
  readIndexIdentity,
  readIndexSchemaVersion,
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
