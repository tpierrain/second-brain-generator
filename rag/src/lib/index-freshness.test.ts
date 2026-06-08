import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIndexFreshness } from "./index-freshness.js";
import type { EmbedderIdentity } from "./vector-store.js";

const gemini: EmbedderIdentity = {
  providerId: "gemini",
  model: "gemini-embedding-001",
  dimension: 3072,
};

test("identité courante ≠ identité estampillée → verdict périmé portant les deux", () => {
  const stamped: EmbedderIdentity = {
    providerId: "ollama",
    model: "nomic-embed-text",
    dimension: 768,
  };

  const verdict = checkIndexFreshness(stamped, gemini);

  assert.deepEqual(verdict, { fresh: false, stamped, current: gemini });
});

test("identité courante = identité estampillée → verdict frais", () => {
  const verdict = checkIndexFreshness({ ...gemini }, gemini);

  assert.deepEqual(verdict, { fresh: true });
});

test("index sans estampille (d'avant ce plan) → périmé, stamped = null", () => {
  const verdict = checkIndexFreshness(null, gemini);

  assert.deepEqual(verdict, { fresh: false, stamped: null, current: gemini });
});
