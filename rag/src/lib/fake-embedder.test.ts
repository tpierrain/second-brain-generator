import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeEmbedder } from "./fake-embedder.js";

test("FakeEmbedder : déterministe (même texte → même vecteur) et de dimension fixe", async () => {
  const embedder = new FakeEmbedder(8);

  const a = await embedder.embedQuery("Pélagie de Mollecuisse");
  const b = await embedder.embedQuery("Pélagie de Mollecuisse");

  assert.deepEqual(a, b); // déterministe : aucun réseau, aucune clé
  assert.equal(a.length, 8); // dimension fixe, portée par l'identité
  assert.equal(embedder.identity.dimension, 8);
});
