import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  applySchema,
  writeIndexIdentity,
  readIndexIdentity,
} from "./vector-store.js";

test("index_meta : round-trip de l'identité (écrite à l'indexation, relue ensuite)", () => {
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
