import { test } from "node:test";
import assert from "node:assert/strict";

import { runEval } from "./eval-run.mjs";

const ITEMS = [
  { question: "Q1 facile", expect: "réponse 1" },
  { question: "Q2 ratée", expect: "réponse 2" },
];

// search factice : renvoie un texte par query, dans l'ordre.
const fakeSearch = async (queries) =>
  queries.map((query) => ({ query, text: `passages pour ${query}` }));

// juge factice : PASS si le prompt parle de Q1, FAIL sinon (déterministe).
const fakeJudge = async (prompt) =>
  prompt.includes("Q1 facile") ? "VERDICT: PASS" : "VERDICT: FAIL";

test("runEval enchaîne recherche → juge → verdict et agrège le score", async () => {
  const report = await runEval({ items: ITEMS, search: fakeSearch, judge: fakeJudge });

  assert.equal(report.passed, 1);
  assert.equal(report.total, 2);
  assert.equal(report.score, 0.5);
  assert.equal(report.results[0].question, "Q1 facile");
  assert.equal(report.results[0].pass, true);
  assert.equal(report.results[1].pass, false);
});
