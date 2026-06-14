import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkIndexFreshness,
  checkSchemaFreshness,
  reindexForce,
  shouldStamp,
  staleIndexMessage,
  staleSchemaMessage,
} from "./index-freshness.js";
import type { EmbedderIdentity } from "./vector-store.js";

const gemini: EmbedderIdentity = {
  providerId: "gemini",
  model: "gemini-embedding-001",
  dimension: 3072,
};

test("current identity ≠ stamped identity → stale verdict carrying both", () => {
  const stamped: EmbedderIdentity = {
    providerId: "ollama",
    model: "nomic-embed-text",
    dimension: 768,
  };

  const verdict = checkIndexFreshness(stamped, gemini);

  assert.deepEqual(verdict, { fresh: false, stamped, current: gemini });
});

test("current identity = stamped identity → fresh verdict", () => {
  const verdict = checkIndexFreshness({ ...gemini }, gemini);

  assert.deepEqual(verdict, { fresh: true });
});

test("index with no stamp (from before this plan) → stale, stamped = null", () => {
  const verdict = checkIndexFreshness(null, gemini);

  assert.deepEqual(verdict, { fresh: false, stamped: null, current: gemini });
});

test("schema freshness: stamped version equals the running constant → fresh", () => {
  assert.equal(checkSchemaFreshness(1, 1), true);
});

test("schema freshness: stamped version older than the running constant → stale", () => {
  assert.equal(checkSchemaFreshness(1, 2), false);
});

test("schema freshness: index stamped before schema versioning (null) → fresh (grandfathered, no prompt)", () => {
  assert.equal(checkSchemaFreshness(null, 1), true);
});

test("stale-schema message: offers the re-index, no \"undefined\" (embedder is unchanged)", () => {
  const msg = staleSchemaMessage();

  assert.ok(!msg.includes("undefined"), "no undefined in the prose");
  assert.match(msg, /re-?index/i);
});

test("reindexForce: a stale schema FORCES a full reindex even when not explicitly requested", () => {
  // Incremental skips unchanged docs (old format left in place) and never re-stamps
  // the schema → the staleness gate would loop forever. A schema bump must re-encode.
  assert.equal(reindexForce(false, 1, 2), true);
});

test("reindexForce: fresh schema, not requested → incremental (no force)", () => {
  assert.equal(reindexForce(false, 1, 1), false);
});

test("reindexForce: an explicit force is always honored", () => {
  assert.equal(reindexForce(true, 1, 1), true);
});

test("reindexForce: a grandfathered index (null schema) is NOT force-reindexed", () => {
  // checkSchemaFreshness grandfathers null as compatible → no surprise re-encode.
  assert.equal(reindexForce(false, null, 2), false);
});

test("reindex force → we (re)stamp (everything is re-encoded with the current embedder)", () => {
  assert.equal(shouldStamp(true, gemini), true);
});

test("incremental on an already-stamped index → we do NOT stamp (no dressing up)", () => {
  assert.equal(shouldStamp(false, gemini), false);
});

test("incremental on an index free of any stamp → we stamp (fresh install / migration)", () => {
  assert.equal(shouldStamp(false, null), true);
});

test("stale message: names both models dynamically + offers the re-index", () => {
  const stamped: EmbedderIdentity = {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  };
  const current: EmbedderIdentity = {
    providerId: "ollama",
    model: "nomic-embed-text",
    dimension: 768,
  };

  const msg = staleIndexMessage(stamped, current);

  assert.ok(msg.includes("gemini-embedding-001"), "names the stamped model");
  assert.ok(msg.includes("nomic-embed-text"), "names the current model");
  assert.match(msg, /re-?index/i);
});

test("stale message with no prior stamp: no \"undefined\", offers the re-index", () => {
  const current: EmbedderIdentity = {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  };

  const msg = staleIndexMessage(null, current);

  assert.ok(!msg.includes("undefined"), "no undefined in the prose");
  assert.ok(msg.includes("gemini-embedding-001"), "names the current model");
  assert.match(msg, /re-?index/i);
});
