import { test } from "node:test";
import assert from "node:assert/strict";

import { EVAL_SET } from "./eval-set.mjs";
import { DEMO_EXPECT } from "./demo.mjs";

test("l'eval-set a au moins 8 questions, toutes bien formées", () => {
  assert.ok(EVAL_SET.length >= 8, `attendu ≥ 8 questions, vu ${EVAL_SET.length}`);
  for (const item of EVAL_SET) {
    assert.equal(typeof item.question, "string");
    assert.ok(item.question.trim().length > 0, "question vide");
    assert.equal(typeof item.expect, "string");
    assert.ok(item.expect.trim().length > 0, "réponse attendue vide");
  }
});

test("l'eval-set est ancré sur le canari sémantique prouvé (Mollecuisse)", () => {
  // Au moins une question doit reposer sur le fait grep-proof de demo.mjs : ça garde
  // l'eval-set arrimé à la preuve sémantique déjà verrouillée par demo.test.mjs.
  assert.ok(EVAL_SET.some((item) => DEMO_EXPECT.test(item.expect)));
});
