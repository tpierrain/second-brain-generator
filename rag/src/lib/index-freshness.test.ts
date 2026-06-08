import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkIndexFreshness,
  shouldStamp,
  staleIndexMessage,
} from "./index-freshness.js";
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

test("reindex force → on (ré)estampille (tout est ré-encodé avec l'embedder courant)", () => {
  assert.equal(shouldStamp(true, gemini), true);
});

test("incrémental sur index déjà estampillé → on n'estampille PAS (on ne maquille pas)", () => {
  assert.equal(shouldStamp(false, gemini), false);
});

test("incrémental sur index vierge d'estampille → on estampille (install neuve / migration)", () => {
  assert.equal(shouldStamp(false, null), true);
});

test("message de péremption : nomme les deux modèles dynamiquement + propose le ré-index", () => {
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

  assert.ok(msg.includes("gemini-embedding-001"), "nomme le modèle stampé");
  assert.ok(msg.includes("nomic-embed-text"), "nomme le modèle courant");
  assert.match(msg, /ré-?index/i);
});

test("message de péremption sans estampille préalable : pas de « undefined », propose le ré-index", () => {
  const current: EmbedderIdentity = {
    providerId: "gemini",
    model: "gemini-embedding-001",
    dimension: 3072,
  };

  const msg = staleIndexMessage(null, current);

  assert.ok(!msg.includes("undefined"), "aucun undefined dans la prose");
  assert.ok(msg.includes("gemini-embedding-001"), "nomme le modèle courant");
  assert.match(msg, /ré-?index/i);
});
