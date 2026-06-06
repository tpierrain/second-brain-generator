import { test } from "node:test";
import assert from "node:assert/strict";

import { DEMO_QUESTION, DEMO_EXPECT } from "./demo.mjs";

test("DEMO_EXPECT distingue une réponse DU VAULT (Mahault) d'une réponse du canon (Leia)", () => {
  assert.ok(DEMO_EXPECT.test("Il a deux demi-sœurs jumelles cachées, Ella et Mahault."));
  assert.ok(!DEMO_EXPECT.test("Sa sœur jumelle est Leia Organa.")); // réponse depuis le canon = RAG down
});

test("DEMO_QUESTION ne partage aucun mot rare avec la réponse (preuve SÉMANTIQUE, pas grep)", () => {
  // Si la question contenait « Mahault »/« demi-sœur », un simple grep suffirait :
  // ça ne prouverait pas la recherche par le sens. Elle ne doit donc pas les contenir.
  assert.ok(!/Mahault|Ella|demi-s[oœ]ur/i.test(DEMO_QUESTION));
  assert.match(DEMO_QUESTION, /Luke Skywalker/); // mais bien ancrée sur le sujet
});
