import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeEmbedder } from "./fake-embedder.js";

test("FakeEmbedder : discrimine deux textes et porte la dimension via son identité", async () => {
  const embedder = new FakeEmbedder(8);

  const pelagie = await embedder.embedQuery("Pélagie de Mollecuisse");
  const autre = await embedder.embedQuery("tout autre chose");

  // Ce qui rend un fake utilisable comme double : deux textes différents
  // donnent deux vecteurs différents (sinon le retrieval matcherait tout).
  assert.notDeepEqual(pelagie, autre);
  // Il reste déterministe : aucun réseau, aucune clé, fonction pure.
  assert.deepEqual(pelagie, await embedder.embedQuery("Pélagie de Mollecuisse"));
  // La dimension produite EST celle annoncée par l'identité (pivot du swap).
  assert.equal(pelagie.length, embedder.identity.dimension);
});
