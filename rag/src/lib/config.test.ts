import { test } from "node:test";
import assert from "node:assert/strict";
import { QUERY_RESERVE } from "./config.js";

test("QUERY_RESERVE par défaut = 50 (crédits réservés à la recherche)", () => {
  assert.equal(QUERY_RESERVE, 50);
});
